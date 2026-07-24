#include <napi.h>

#include <windows.h>
#include <objbase.h>
#include <shobjidl_core.h>

#include <cstdint>
#include <cstdio>
#include <iomanip>
#include <memory>
#include <optional>
#include <sstream>
#include <stdexcept>
#include <string>
#include <utility>
#include <vector>

#include <winrt/base.h>
#include <winrt/Windows.Foundation.h>
#include <winrt/Windows.Foundation.Collections.h>
#include <winrt/Windows.Services.Store.h>

namespace
{
    using winrt::Windows::Foundation::AsyncStatus;
    using winrt::Windows::Services::Store::StoreContext;
    using winrt::Windows::Services::Store::StoreProduct;
    using winrt::Windows::Services::Store::StoreProductQueryResult;
    using winrt::Windows::Services::Store::StorePurchaseResult;
    using winrt::Windows::Services::Store::StorePurchaseStatus;
    using winrt::Windows::Services::Store::StoreSku;
    using winrt::Windows::Services::Store::StoreConsumableResult;
    using winrt::Windows::Services::Store::StoreConsumableStatus;

    struct PurchaseCompletion
    {
        std::string outcome{ "failed" };
        std::optional<std::string> errorCode;
        std::optional<std::string> errorMessage;
    };

    struct UnfulfilledConsumableItem
    {
        std::string trackingId;
        std::string productId;
        uint32_t quantity{ 0 };
    };

    struct UnfulfilledConsumablesCompletion
    {
        bool ok{ false };
        std::vector<UnfulfilledConsumableItem> items;
        std::optional<std::string> errorCode;
        std::optional<std::string> errorMessage;
    };

    struct ReportConsumableCompletion
    {
        bool ok{ false };
        std::string status{ "failed" };
        std::optional<std::string> trackingId;
        uint32_t balanceRemaining{ 0 };
        std::optional<std::string> errorCode;
        std::optional<std::string> errorMessage;
    };

    struct StoreStatusProduct
    {
        std::string storeId;
        std::optional<std::string> title;
        bool isInUserCollection{ false };
    };

    struct StoreStatusSku
    {
        std::optional<std::string> storeId;
        std::optional<std::string> title;
        bool isSubscription{ false };
        bool isInUserCollection{ false };
        std::optional<std::string> collectionEndDate;
    };

    struct StoreStatusLicense
    {
        std::optional<std::string> storeId;
        bool isActive{ false };
        std::optional<std::string> expirationDate;
    };

    struct StoreStatusCompletion
    {
        std::string fetchedAt;
        std::string availability{ "supported" };
        bool appLicenseActive{ false };
        std::optional<StoreStatusProduct> product;
        std::optional<StoreStatusSku> sku;
        std::optional<StoreStatusLicense> license;
        std::string purchaseEligibility{ "unknown" };
        std::optional<std::string> errorCode;
        std::optional<std::string> errorMessage;
    };

    std::string WideToUtf8(std::wstring const& value)
    {
        if (value.empty())
        {
            return {};
        }

        auto const size = ::WideCharToMultiByte(
            CP_UTF8,
            0,
            value.c_str(),
            static_cast<int>(value.size()),
            nullptr,
            0,
            nullptr,
            nullptr);

        if (size <= 0)
        {
            return {};
        }

        std::string converted(static_cast<std::size_t>(size), '\0');
        ::WideCharToMultiByte(
            CP_UTF8,
            0,
            value.c_str(),
            static_cast<int>(value.size()),
            converted.data(),
            size,
            nullptr,
            nullptr);
        return converted;
    }

    std::wstring Utf8ToWide(std::string const& value)
    {
        if (value.empty())
        {
            return {};
        }

        auto const size = ::MultiByteToWideChar(
            CP_UTF8,
            0,
            value.c_str(),
            static_cast<int>(value.size()),
            nullptr,
            0);

        if (size <= 0)
        {
            return std::wstring{ value.begin(), value.end() };
        }

        std::wstring converted(static_cast<std::size_t>(size), L'\0');
        ::MultiByteToWideChar(
            CP_UTF8,
            0,
            value.c_str(),
            static_cast<int>(value.size()),
            converted.data(),
            size);
        return converted;
    }

    std::optional<std::string> NormalizeHString(winrt::hstring const& value)
    {
        if (value.empty())
        {
            return std::nullopt;
        }

        auto const converted = WideToUtf8(std::wstring{ value.c_str() });
        return converted.empty() ? std::nullopt : std::optional<std::string>{ converted };
    }

    std::string FormatHresult(HRESULT hr)
    {
        std::ostringstream stream;
        stream << "0x" << std::uppercase << std::hex << static_cast<unsigned long>(hr);
        return stream.str();
    }

    std::optional<std::string> NormalizeErrorCodeValue(HRESULT hr)
    {
        if (SUCCEEDED(hr) || hr == E_FAIL)
        {
            return std::nullopt;
        }

        return FormatHresult(hr);
    }

    std::optional<std::string> ParseErrorMessage(winrt::hresult_error const& error)
    {
        auto const message = error.message();
        if (message.empty())
        {
            return FormatHresult(error.code());
        }

        auto const converted = WideToUtf8(std::wstring{ message.c_str() });
        return converted.empty() ? std::optional<std::string>{ FormatHresult(error.code()) } : std::optional<std::string>{ converted };
    }


    std::string GuidToString(winrt::guid const& value)
    {
        char buffer[64]{};
        // winrt::guid layout matches GUID
        auto const& g = reinterpret_cast<GUID const&>(value);
        std::snprintf(
            buffer,
            sizeof(buffer),
            "%08lX-%04X-%04X-%02X%02X-%02X%02X%02X%02X%02X%02X",
            static_cast<unsigned long>(g.Data1),
            g.Data2,
            g.Data3,
            g.Data4[0],
            g.Data4[1],
            g.Data4[2],
            g.Data4[3],
            g.Data4[4],
            g.Data4[5],
            g.Data4[6],
            g.Data4[7]);
        return std::string{ buffer };
    }

    winrt::guid ParseGuid(std::string const& value)
    {
        if (value.empty())
        {
            return winrt::guid{};
        }

        GUID parsed{};
        auto wide = Utf8ToWide(value);
        if (wide.empty() || wide.front() != L'{')
        {
            wide = L"{" + wide + L"}";
        }
        winrt::check_hresult(::CLSIDFromString(wide.c_str(), &parsed));
        return winrt::guid{ parsed };
    }

    winrt::guid NewTrackingGuid()
    {
        GUID generated{};
        winrt::check_hresult(::CoCreateGuid(&generated));
        return winrt::guid{ generated };
    }

    std::string MapConsumableStatus(StoreConsumableStatus const status)
    {
        switch (status)
        {
        case StoreConsumableStatus::Succeeded:
            return "succeeded";
        case StoreConsumableStatus::InsufficentQuantity:
            return "insufficient-quantity";
        case StoreConsumableStatus::NetworkError:
            return "network-error";
        case StoreConsumableStatus::ServerError:
            return "server-error";
        default:
            return "failed";
        }
    }

    std::string SystemTimeToIso(SYSTEMTIME const& value)
    {
        std::ostringstream stream;
        stream << std::setfill('0')
               << std::setw(4) << value.wYear << '-'
               << std::setw(2) << value.wMonth << '-'
               << std::setw(2) << value.wDay << 'T'
               << std::setw(2) << value.wHour << ':'
               << std::setw(2) << value.wMinute << ':'
               << std::setw(2) << value.wSecond << '.'
               << std::setw(3) << value.wMilliseconds << 'Z';
        return stream.str();
    }

    std::string CurrentTimestampIso()
    {
        SYSTEMTIME value{};
        ::GetSystemTime(&value);
        return SystemTimeToIso(value);
    }

    std::optional<std::string> DateTimeToIso(winrt::Windows::Foundation::DateTime const& value)
    {
        auto const ticks = value.time_since_epoch().count();
        if (ticks <= 0)
        {
            return std::nullopt;
        }

        ULARGE_INTEGER rawValue{};
        rawValue.QuadPart = static_cast<ULONGLONG>(ticks);

        FILETIME fileTime{};
        fileTime.dwLowDateTime = rawValue.LowPart;
        fileTime.dwHighDateTime = rawValue.HighPart;

        SYSTEMTIME systemTime{};
        if (!::FileTimeToSystemTime(&fileTime, &systemTime))
        {
            return std::nullopt;
        }

        return SystemTimeToIso(systemTime);
    }

    std::string MapOutcome(StorePurchaseStatus const status)
    {
        switch (status)
        {
        case StorePurchaseStatus::Succeeded:
            return "succeeded";
        case StorePurchaseStatus::AlreadyPurchased:
            return "already-purchased";
        case StorePurchaseStatus::NotPurchased:
            return "not-purchased";
        case StorePurchaseStatus::NetworkError:
            return "network-error";
        case StorePurchaseStatus::ServerError:
            return "server-error";
        default:
            return "failed";
        }
    }

    HWND ParseWindowHandle(std::string const& value)
    {
        if (value.empty())
        {
            return nullptr;
        }

        std::size_t parsedLength = 0;
        auto const rawValue = std::stoull(value, &parsedLength, 0);
        if (parsedLength != value.size())
        {
            throw std::runtime_error("Invalid owner window handle.");
        }

        return reinterpret_cast<HWND>(rawValue);
    }

    StoreProduct FindMatchingStoreProduct(StoreProductQueryResult const& queryResult, winrt::hstring const& storeId)
    {
        auto const products = queryResult.Products();
        if (!products || !products.HasKey(storeId))
        {
            return nullptr;
        }

        return products.Lookup(storeId);
    }

    std::optional<StoreStatusSku> NormalizeSku(StoreSku const& sku)
    {
        if (!sku)
        {
            return std::nullopt;
        }

        std::optional<std::string> collectionEndDate = std::nullopt;

        try
        {
            auto const collectionData = sku.CollectionData();
            if (collectionData)
            {
                collectionEndDate = DateTimeToIso(collectionData.EndDate());
            }
        }
        catch (...)
        {
            collectionEndDate = std::nullopt;
        }

        return StoreStatusSku{
            NormalizeHString(sku.StoreId()),
            NormalizeHString(sku.Title()),
            sku.IsSubscription(),
            sku.IsInUserCollection(),
            collectionEndDate,
        };
    }

    std::optional<StoreStatusSku> FindOwnedSku(StoreProduct const& product)
    {
        if (!product)
        {
            return std::nullopt;
        }

        auto const skus = product.Skus();
        for (StoreSku const& sku : skus)
        {
            if (sku && sku.IsInUserCollection())
            {
                return NormalizeSku(sku);
            }
        }

        if (product.IsInUserCollection() && skus.Size() > 0)
        {
            auto fallbackSku = NormalizeSku(skus.GetAt(0));
            if (fallbackSku)
            {
                fallbackSku->isInUserCollection = true;
            }
            return fallbackSku;
        }

        return std::nullopt;
    }

    StoreStatusProduct NormalizeProduct(
        StoreProduct const& product,
        std::wstring const& fallbackStoreId,
        std::wstring const& fallbackTitle,
        bool isOwned)
    {
        auto const fallbackStoreIdUtf8 = WideToUtf8(fallbackStoreId);
        auto const fallbackTitleUtf8 = WideToUtf8(fallbackTitle);

        return StoreStatusProduct{
            product ? NormalizeHString(product.StoreId()).value_or(fallbackStoreIdUtf8) : fallbackStoreIdUtf8,
            product ? NormalizeHString(product.Title()).value_or(fallbackTitleUtf8) : std::optional<std::string>{ fallbackTitleUtf8 },
            isOwned || (product && product.IsInUserCollection()),
        };
    }

    std::optional<std::string> GetQueryResultErrorCode(StoreProductQueryResult const& queryResult)
    {
        return NormalizeErrorCodeValue(queryResult.ExtendedError());
    }

    StoreStatusCompletion BuildSupportedStatusCompletion(
        std::string fetchedAt,
        std::wstring const& storeId,
        std::wstring const& productName,
        StoreProductQueryResult const& associatedQueryResult,
        StoreProductQueryResult const& collectionQueryResult)
    {
        auto const associatedProduct = FindMatchingStoreProduct(associatedQueryResult, winrt::hstring{ storeId });
        auto const collectionProduct = FindMatchingStoreProduct(collectionQueryResult, winrt::hstring{ storeId });
        auto sku = FindOwnedSku(collectionProduct);
        if (!sku)
        {
            sku = FindOwnedSku(associatedProduct);
        }

        auto const isOwned = (collectionProduct && collectionProduct.IsInUserCollection())
            || (associatedProduct && associatedProduct.IsInUserCollection())
            || (sku && sku->isInUserCollection);

        auto errorCode = GetQueryResultErrorCode(collectionQueryResult);
        if (!errorCode)
        {
            errorCode = GetQueryResultErrorCode(associatedQueryResult);
        }

        StoreStatusCompletion completion;
        completion.fetchedAt = std::move(fetchedAt);
        completion.availability = "supported";
        completion.product = NormalizeProduct(
            associatedProduct ? associatedProduct : collectionProduct,
            storeId,
            productName,
            isOwned);
        completion.sku = std::move(sku);
        completion.purchaseEligibility = isOwned
            ? "license-action-not-applicable"
            : associatedProduct
                ? "licensable"
                : "unknown";
        completion.errorCode = errorCode;
        completion.errorMessage = errorCode
            ? std::optional<std::string>{ "Microsoft Store product query failed with " + *errorCode + "." }
            : std::nullopt;
        return completion;
    }

    StoreStatusCompletion BuildUnavailableStatusCompletion(
        std::string fetchedAt,
        std::optional<std::string> errorCode,
        std::optional<std::string> errorMessage)
    {
        StoreStatusCompletion completion;
        completion.fetchedAt = std::move(fetchedAt);
        completion.availability = "store-unavailable";
        completion.appLicenseActive = false;
        completion.purchaseEligibility = "unknown";
        completion.errorCode = std::move(errorCode);
        completion.errorMessage = std::move(errorMessage);
        return completion;
    }

    Napi::Value ToNullableString(Napi::Env env, std::optional<std::string> const& value)
    {
        return value ? Napi::String::New(env, *value) : env.Null();
    }

    Napi::Object ToProductObject(Napi::Env env, StoreStatusProduct const& value)
    {
        auto result = Napi::Object::New(env);
        result.Set("storeId", Napi::String::New(env, value.storeId));
        result.Set("title", ToNullableString(env, value.title));
        result.Set("isInUserCollection", Napi::Boolean::New(env, value.isInUserCollection));
        return result;
    }

    Napi::Object ToSkuObject(Napi::Env env, StoreStatusSku const& value)
    {
        auto result = Napi::Object::New(env);
        result.Set("storeId", ToNullableString(env, value.storeId));
        result.Set("title", ToNullableString(env, value.title));
        result.Set("isSubscription", Napi::Boolean::New(env, value.isSubscription));
        result.Set("isInUserCollection", Napi::Boolean::New(env, value.isInUserCollection));
        result.Set("collectionEndDate", ToNullableString(env, value.collectionEndDate));
        return result;
    }

    Napi::Object ToLicenseObject(Napi::Env env, StoreStatusLicense const& value)
    {
        auto result = Napi::Object::New(env);
        result.Set("storeId", ToNullableString(env, value.storeId));
        result.Set("isActive", Napi::Boolean::New(env, value.isActive));
        result.Set("expirationDate", ToNullableString(env, value.expirationDate));
        return result;
    }

    class PurchaseRequest : public std::enable_shared_from_this<PurchaseRequest>
    {
    public:
        PurchaseRequest(Napi::Env env, std::wstring storeId, HWND ownerWindow)
            : env_(env)
            , deferred_(Napi::Promise::Deferred::New(env))
            , storeId_(std::move(storeId))
            , ownerWindow_(ownerWindow)
        {
        }

        Napi::Promise Start()
        {
            try
            {
                try
                {
                    winrt::init_apartment(winrt::apartment_type::single_threaded);
                }
                catch (...)
                {
                    // Electron may have already initialized COM for this thread.
                }

                threadsafeFunction_ = Napi::ThreadSafeFunction::New(
                    env_,
                    Napi::Function::New(env_, [](Napi::CallbackInfo const&) {}),
                    "HagicodeStorePurchaseAddon",
                    0,
                    1);

                auto const context = StoreContext::GetDefault();
                if (ownerWindow_ != nullptr)
                {
                    auto initializeWithWindow = context.as<IInitializeWithWindow>();
                    winrt::check_hresult(initializeWithWindow->Initialize(ownerWindow_));
                }

                auto const operation = context.RequestPurchaseAsync(winrt::hstring{ storeId_ });
                auto self = shared_from_this();
                operation.Completed([self, operation](auto const&, AsyncStatus status) mutable
                {
                    PurchaseCompletion completion;

                    try
                    {
                        if (status == AsyncStatus::Completed)
                        {
                            StorePurchaseResult const result = operation.GetResults();
                            completion.outcome = MapOutcome(result.Status());
                            completion.errorCode = NormalizeErrorCodeValue(result.ExtendedError());
                        }
                        else if (status == AsyncStatus::Canceled)
                        {
                            completion.outcome = "canceled";
                        }
                        else
                        {
                            auto const errorCode = operation.ErrorCode();
                            completion.outcome = "failed";
                            completion.errorCode = NormalizeErrorCodeValue(errorCode);
                            completion.errorMessage = FormatHresult(errorCode);
                        }
                    }
                    catch (winrt::hresult_error const& error)
                    {
                        completion.outcome = "failed";
                        completion.errorCode = NormalizeErrorCodeValue(error.code());
                        completion.errorMessage = ParseErrorMessage(error);
                    }
                    catch (std::exception const& error)
                    {
                        completion.outcome = "failed";
                        completion.errorMessage = std::string{ error.what() };
                    }

                    self->QueueCompletion(std::move(completion));
                });
            }
            catch (winrt::hresult_error const& error)
            {
                deferred_.Reject(BuildErrorValue(
                    NormalizeErrorCodeValue(error.code()),
                    ParseErrorMessage(error)));
            }
            catch (std::exception const& error)
            {
                deferred_.Reject(BuildErrorValue(std::nullopt, std::string{ error.what() }));
            }

            return deferred_.Promise();
        }

    private:
        void QueueCompletion(PurchaseCompletion completion)
        {
            auto payload = new PurchaseCompletion(std::move(completion));
            auto self = shared_from_this();
            auto const status = threadsafeFunction_.BlockingCall(payload, [self](Napi::Env env, Napi::Function, PurchaseCompletion* data)
            {
                std::unique_ptr<PurchaseCompletion> ownedData{ data };
                self->ResolveOnJs(env, *ownedData);
            });

            if (status == napi_ok)
            {
                threadsafeFunction_.Release();
            }
        }

        void ResolveOnJs(Napi::Env env, PurchaseCompletion const& completion)
        {
            auto result = Napi::Object::New(env);
            result.Set("outcome", completion.outcome);
            result.Set("errorCode", ToNullableString(env, completion.errorCode));
            result.Set("errorMessage", ToNullableString(env, completion.errorMessage));
            deferred_.Resolve(result);
        }

        Napi::Value BuildErrorValue(
            std::optional<std::string> const& errorCode,
            std::optional<std::string> const& errorMessage) const
        {
            auto error = Napi::Object::New(env_);
            error.Set("code", ToNullableString(env_, errorCode));
            error.Set("message", ToNullableString(env_, errorMessage));
            return error;
        }

        Napi::Env env_;
        Napi::Promise::Deferred deferred_;
        Napi::ThreadSafeFunction threadsafeFunction_;
        std::wstring storeId_;
        HWND ownerWindow_{ nullptr };
    };

    class QueryStatusRequest : public std::enable_shared_from_this<QueryStatusRequest>
    {
    public:
        QueryStatusRequest(
            Napi::Env env,
            std::wstring storeId,
            std::wstring productName,
            std::vector<std::wstring> productKinds)
            : env_(env)
            , deferred_(Napi::Promise::Deferred::New(env))
            , storeId_(std::move(storeId))
            , productName_(std::move(productName))
            , productKinds_(std::move(productKinds))
        {
        }

        Napi::Promise Start()
        {
            try
            {
                try
                {
                    winrt::init_apartment(winrt::apartment_type::single_threaded);
                }
                catch (...)
                {
                    // Electron may have already initialized COM for this thread.
                }

                threadsafeFunction_ = Napi::ThreadSafeFunction::New(
                    env_,
                    Napi::Function::New(env_, [](Napi::CallbackInfo const&) {}),
                    "HagicodeStoreStatusAddon",
                    0,
                    1);

                queryAction_ = RunQueryAsync();
                auto self = shared_from_this();
                queryAction_.Completed([self](auto const& operation, AsyncStatus status)
                {
                    if (status == AsyncStatus::Completed)
                    {
                        self->QueueCompletion(std::move(self->completion_));
                        return;
                    }

                    auto const errorCode = status == AsyncStatus::Canceled
                        ? std::optional<std::string>{ "canceled" }
                        : NormalizeErrorCodeValue(operation.ErrorCode());
                    auto const errorMessage = status == AsyncStatus::Canceled
                        ? std::optional<std::string>{ "Microsoft Store status query was canceled." }
                        : std::optional<std::string>{ FormatHresult(operation.ErrorCode()) };

                    self->QueueCompletion(BuildUnavailableStatusCompletion(
                        CurrentTimestampIso(),
                        errorCode,
                        errorMessage));
                });
            }
            catch (winrt::hresult_error const& error)
            {
                deferred_.Reject(BuildErrorValue(
                    NormalizeErrorCodeValue(error.code()),
                    ParseErrorMessage(error)));
            }
            catch (std::exception const& error)
            {
                deferred_.Reject(BuildErrorValue(std::nullopt, std::string{ error.what() }));
            }

            return deferred_.Promise();
        }

    private:
        winrt::Windows::Foundation::IAsyncAction RunQueryAsync()
        {
            auto const fetchedAt = CurrentTimestampIso();

            try
            {
                StoreContext const context = StoreContext::GetDefault();
                std::vector<winrt::hstring> queryKinds;
                queryKinds.reserve(productKinds_.size());
                for (auto const& productKind : productKinds_)
                {
                    queryKinds.emplace_back(productKind);
                }

                auto const kinds = winrt::single_threaded_vector<winrt::hstring>(std::move(queryKinds));
                auto const associatedQueryResult = co_await context.GetAssociatedStoreProductsAsync(kinds);
                auto const collectionQueryResult = co_await context.GetUserCollectionAsync(kinds);

                completion_ = BuildSupportedStatusCompletion(
                    fetchedAt,
                    storeId_,
                    productName_,
                    associatedQueryResult,
                    collectionQueryResult);
            }
            catch (winrt::hresult_error const& error)
            {
                completion_ = BuildUnavailableStatusCompletion(
                    fetchedAt,
                    NormalizeErrorCodeValue(error.code()),
                    ParseErrorMessage(error));
            }
            catch (std::exception const& error)
            {
                completion_ = BuildUnavailableStatusCompletion(
                    fetchedAt,
                    std::nullopt,
                    std::string{ error.what() });
            }
        }

        void QueueCompletion(StoreStatusCompletion completion)
        {
            auto payload = new StoreStatusCompletion(std::move(completion));
            auto self = shared_from_this();
            auto const status = threadsafeFunction_.BlockingCall(payload, [self](Napi::Env env, Napi::Function, StoreStatusCompletion* data)
            {
                std::unique_ptr<StoreStatusCompletion> ownedData{ data };
                self->ResolveOnJs(env, *ownedData);
            });

            if (status == napi_ok)
            {
                threadsafeFunction_.Release();
            }
        }

        void ResolveOnJs(Napi::Env env, StoreStatusCompletion const& completion)
        {
            auto result = Napi::Object::New(env);
            result.Set("fetchedAt", Napi::String::New(env, completion.fetchedAt));
            result.Set("availability", Napi::String::New(env, completion.availability));
            result.Set("appLicenseActive", Napi::Boolean::New(env, completion.appLicenseActive));
            result.Set("product", completion.product ? ToProductObject(env, *completion.product) : env.Null());
            result.Set("sku", completion.sku ? ToSkuObject(env, *completion.sku) : env.Null());
            result.Set("license", completion.license ? ToLicenseObject(env, *completion.license) : env.Null());
            result.Set("purchaseEligibility", Napi::String::New(env, completion.purchaseEligibility));
            result.Set("errorCode", ToNullableString(env, completion.errorCode));
            result.Set("errorMessage", ToNullableString(env, completion.errorMessage));
            deferred_.Resolve(result);
        }

        Napi::Value BuildErrorValue(
            std::optional<std::string> const& errorCode,
            std::optional<std::string> const& errorMessage) const
        {
            auto error = Napi::Object::New(env_);
            error.Set("code", ToNullableString(env_, errorCode));
            error.Set("message", ToNullableString(env_, errorMessage));
            return error;
        }

        Napi::Env env_;
        Napi::Promise::Deferred deferred_;
        Napi::ThreadSafeFunction threadsafeFunction_;
        std::wstring storeId_;
        std::wstring productName_;
        std::vector<std::wstring> productKinds_;
        StoreStatusCompletion completion_{};
        winrt::Windows::Foundation::IAsyncAction queryAction_{ nullptr };
    };


    class GetUnfulfilledConsumablesRequest : public std::enable_shared_from_this<GetUnfulfilledConsumablesRequest>
    {
    public:
        GetUnfulfilledConsumablesRequest(Napi::Env env, std::vector<std::wstring> productIds)
            : env_(env)
            , deferred_(Napi::Promise::Deferred::New(env))
            , productIds_(std::move(productIds))
        {
        }

        Napi::Promise Start()
        {
            try
            {
                try
                {
                    winrt::init_apartment(winrt::apartment_type::single_threaded);
                }
                catch (...)
                {
                    // Electron may have already initialized COM for this thread.
                }

                threadsafeFunction_ = Napi::ThreadSafeFunction::New(
                    env_,
                    Napi::Function::New(env_, [](Napi::CallbackInfo const&) {}),
                    "HagicodeStoreUnfulfilledConsumablesAddon",
                    0,
                    1);

                queryAction_ = RunQueryAsync();
                auto self = shared_from_this();
                queryAction_.Completed([self](auto const& operation, AsyncStatus status)
                {
                    if (status == AsyncStatus::Completed)
                    {
                        self->QueueCompletion(std::move(self->completion_));
                        return;
                    }

                    UnfulfilledConsumablesCompletion completion;
                    completion.ok = false;
                    if (status == AsyncStatus::Canceled)
                    {
                        completion.errorCode = "canceled";
                        completion.errorMessage = "Unfulfilled consumables query was canceled.";
                    }
                    else
                    {
                        completion.errorCode = NormalizeErrorCodeValue(operation.ErrorCode());
                        completion.errorMessage = FormatHresult(operation.ErrorCode());
                    }
                    self->QueueCompletion(std::move(completion));
                });
            }
            catch (winrt::hresult_error const& error)
            {
                deferred_.Reject(BuildErrorValue(
                    NormalizeErrorCodeValue(error.code()),
                    ParseErrorMessage(error)));
            }
            catch (std::exception const& error)
            {
                deferred_.Reject(BuildErrorValue(std::nullopt, std::string{ error.what() }));
            }

            return deferred_.Promise();
        }

    private:
        winrt::Windows::Foundation::IAsyncAction RunQueryAsync()
        {
            auto context = StoreContext::GetDefault();
            UnfulfilledConsumablesCompletion completion;
            completion.ok = true;

            for (auto const& productIdWide : productIds_)
            {
                auto const productIdH = winrt::hstring{ productIdWide };
                auto const result = co_await context.GetConsumableBalanceRemainingAsync(productIdH);
                auto const balance = result.BalanceRemaining();
                if (balance > 0)
                {
                    UnfulfilledConsumableItem item;
                    item.productId = WideToUtf8(std::wstring{ productIdWide });
                    item.quantity = balance;
                    try
                    {
                        item.trackingId = GuidToString(result.TrackingId());
                    }
                    catch (...)
                    {
                        item.trackingId = {};
                    }
                    completion.items.push_back(std::move(item));
                }

                auto const extended = result.ExtendedError();
                if (FAILED(extended) && extended != E_FAIL)
                {
                    // Keep collecting other products; surface first hard error as soft signal when no items.
                    if (!completion.errorCode)
                    {
                        completion.errorCode = NormalizeErrorCodeValue(extended);
                        completion.errorMessage = FormatHresult(extended);
                    }
                }
            }

            completion_ = std::move(completion);
            co_return;
        }

        void QueueCompletion(UnfulfilledConsumablesCompletion completion)
        {
            auto payload = new UnfulfilledConsumablesCompletion(std::move(completion));
            auto self = shared_from_this();
            auto const status = threadsafeFunction_.BlockingCall(payload, [self](Napi::Env env, Napi::Function, UnfulfilledConsumablesCompletion* data)
            {
                std::unique_ptr<UnfulfilledConsumablesCompletion> ownedData{ data };
                self->ResolveOnJs(env, *ownedData);
            });

            if (status == napi_ok)
            {
                threadsafeFunction_.Release();
            }
        }

        void ResolveOnJs(Napi::Env env, UnfulfilledConsumablesCompletion const& completion)
        {
            auto result = Napi::Object::New(env);
            result.Set("ok", Napi::Boolean::New(env, completion.ok));
            auto items = Napi::Array::New(env, static_cast<uint32_t>(completion.items.size()));
            for (uint32_t index = 0; index < completion.items.size(); ++index)
            {
                auto const& item = completion.items[index];
                auto entry = Napi::Object::New(env);
                entry.Set("trackingId", Napi::String::New(env, item.trackingId));
                entry.Set("productId", Napi::String::New(env, item.productId));
                entry.Set("quantity", Napi::Number::New(env, item.quantity));
                items.Set(index, entry);
            }
            result.Set("items", items);
            result.Set("errorCode", ToNullableString(env, completion.errorCode));
            result.Set("errorMessage", ToNullableString(env, completion.errorMessage));
            deferred_.Resolve(result);
        }

        Napi::Value BuildErrorValue(
            std::optional<std::string> const& errorCode,
            std::optional<std::string> const& errorMessage) const
        {
            auto error = Napi::Object::New(env_);
            error.Set("code", ToNullableString(env_, errorCode));
            error.Set("message", ToNullableString(env_, errorMessage));
            return error;
        }

        Napi::Env env_;
        Napi::Promise::Deferred deferred_;
        Napi::ThreadSafeFunction threadsafeFunction_;
        std::vector<std::wstring> productIds_;
        winrt::Windows::Foundation::IAsyncAction queryAction_{ nullptr };
        UnfulfilledConsumablesCompletion completion_{};
    };

    class ReportConsumableFulfillmentRequest : public std::enable_shared_from_this<ReportConsumableFulfillmentRequest>
    {
    public:
        ReportConsumableFulfillmentRequest(
            Napi::Env env,
            std::wstring productId,
            uint32_t quantity,
            winrt::guid trackingId)
            : env_(env)
            , deferred_(Napi::Promise::Deferred::New(env))
            , productId_(std::move(productId))
            , quantity_(quantity)
            , trackingId_(trackingId)
        {
        }

        Napi::Promise Start()
        {
            try
            {
                try
                {
                    winrt::init_apartment(winrt::apartment_type::single_threaded);
                }
                catch (...)
                {
                    // Electron may have already initialized COM for this thread.
                }

                threadsafeFunction_ = Napi::ThreadSafeFunction::New(
                    env_,
                    Napi::Function::New(env_, [](Napi::CallbackInfo const&) {}),
                    "HagicodeStoreReportConsumableAddon",
                    0,
                    1);

                auto const context = StoreContext::GetDefault();
                auto const operation = context.ReportConsumableFulfillmentAsync(
                    winrt::hstring{ productId_ },
                    quantity_,
                    trackingId_);
                auto self = shared_from_this();
                operation.Completed([self, operation](auto const&, AsyncStatus status) mutable
                {
                    ReportConsumableCompletion completion;

                    try
                    {
                        if (status == AsyncStatus::Completed)
                        {
                            StoreConsumableResult const result = operation.GetResults();
                            completion.status = MapConsumableStatus(result.Status());
                            completion.ok = result.Status() == StoreConsumableStatus::Succeeded;
                            completion.balanceRemaining = result.BalanceRemaining();
                            try
                            {
                                completion.trackingId = GuidToString(result.TrackingId());
                            }
                            catch (...)
                            {
                                completion.trackingId = GuidToString(self->trackingId_);
                            }
                            completion.errorCode = NormalizeErrorCodeValue(result.ExtendedError());
                            if (!completion.ok && !completion.errorMessage)
                            {
                                completion.errorMessage = "ReportConsumableFulfillment status=" + completion.status;
                            }
                        }
                        else if (status == AsyncStatus::Canceled)
                        {
                            completion.ok = false;
                            completion.status = "canceled";
                            completion.errorCode = "canceled";
                            completion.errorMessage = "ReportConsumableFulfillment was canceled.";
                        }
                        else
                        {
                            auto const errorCode = operation.ErrorCode();
                            completion.ok = false;
                            completion.status = "failed";
                            completion.errorCode = NormalizeErrorCodeValue(errorCode);
                            completion.errorMessage = FormatHresult(errorCode);
                        }
                    }
                    catch (winrt::hresult_error const& error)
                    {
                        completion.ok = false;
                        completion.status = "failed";
                        completion.errorCode = NormalizeErrorCodeValue(error.code());
                        completion.errorMessage = ParseErrorMessage(error);
                    }
                    catch (std::exception const& error)
                    {
                        completion.ok = false;
                        completion.status = "failed";
                        completion.errorMessage = std::string{ error.what() };
                    }

                    self->QueueCompletion(std::move(completion));
                });
            }
            catch (winrt::hresult_error const& error)
            {
                deferred_.Reject(BuildErrorValue(
                    NormalizeErrorCodeValue(error.code()),
                    ParseErrorMessage(error)));
            }
            catch (std::exception const& error)
            {
                deferred_.Reject(BuildErrorValue(std::nullopt, std::string{ error.what() }));
            }

            return deferred_.Promise();
        }

    private:
        void QueueCompletion(ReportConsumableCompletion completion)
        {
            auto payload = new ReportConsumableCompletion(std::move(completion));
            auto self = shared_from_this();
            auto const status = threadsafeFunction_.BlockingCall(payload, [self](Napi::Env env, Napi::Function, ReportConsumableCompletion* data)
            {
                std::unique_ptr<ReportConsumableCompletion> ownedData{ data };
                self->ResolveOnJs(env, *ownedData);
            });

            if (status == napi_ok)
            {
                threadsafeFunction_.Release();
            }
        }

        void ResolveOnJs(Napi::Env env, ReportConsumableCompletion const& completion)
        {
            auto result = Napi::Object::New(env);
            result.Set("ok", Napi::Boolean::New(env, completion.ok));
            result.Set("status", Napi::String::New(env, completion.status));
            result.Set("trackingId", ToNullableString(env, completion.trackingId));
            result.Set("balanceRemaining", Napi::Number::New(env, completion.balanceRemaining));
            result.Set("errorCode", ToNullableString(env, completion.errorCode));
            result.Set("errorMessage", ToNullableString(env, completion.errorMessage));
            deferred_.Resolve(result);
        }

        Napi::Value BuildErrorValue(
            std::optional<std::string> const& errorCode,
            std::optional<std::string> const& errorMessage) const
        {
            auto error = Napi::Object::New(env_);
            error.Set("code", ToNullableString(env_, errorCode));
            error.Set("message", ToNullableString(env_, errorMessage));
            return error;
        }

        Napi::Env env_;
        Napi::Promise::Deferred deferred_;
        Napi::ThreadSafeFunction threadsafeFunction_;
        std::wstring productId_;
        uint32_t quantity_{ 1 };
        winrt::guid trackingId_{};
    };

    Napi::Value RequestPurchase(Napi::CallbackInfo const& info)
    {
        auto env = info.Env();

        if (info.Length() < 1 || !info[0].IsString())
        {
            throw Napi::TypeError::New(env, "requestPurchase requires a Store ID string.");
        }

        auto const storeId = Utf8ToWide(info[0].As<Napi::String>().Utf8Value());
        HWND ownerWindow = nullptr;

        if (info.Length() >= 2 && !info[1].IsNull() && !info[1].IsUndefined())
        {
            if (!info[1].IsString())
            {
                throw Napi::TypeError::New(env, "requestPurchase owner window must be a string when provided.");
            }

            ownerWindow = ParseWindowHandle(info[1].As<Napi::String>().Utf8Value());
        }

        return std::make_shared<PurchaseRequest>(env, storeId, ownerWindow)->Start();
    }

    Napi::Value QueryStoreStatus(Napi::CallbackInfo const& info)
    {
        auto env = info.Env();

        if (info.Length() < 3 || !info[0].IsString() || !info[1].IsString() || !info[2].IsArray())
        {
            throw Napi::TypeError::New(env, "queryStoreStatus requires storeId, productName, and productKinds.");
        }

        auto const storeId = Utf8ToWide(info[0].As<Napi::String>().Utf8Value());
        auto const productName = Utf8ToWide(info[1].As<Napi::String>().Utf8Value());
        auto const productKindsArray = info[2].As<Napi::Array>();

        std::vector<std::wstring> productKinds;
        productKinds.reserve(productKindsArray.Length());
        for (uint32_t index = 0; index < productKindsArray.Length(); ++index)
        {
            auto const value = productKindsArray.Get(index);
            if (!value.IsString())
            {
                throw Napi::TypeError::New(env, "queryStoreStatus productKinds must contain only strings.");
            }

            productKinds.emplace_back(Utf8ToWide(value.As<Napi::String>().Utf8Value()));
        }

        return std::make_shared<QueryStatusRequest>(
            env,
            storeId,
            productName,
            std::move(productKinds))->Start();
    }
}


    Napi::Value GetUnfulfilledConsumables(Napi::CallbackInfo const& info)
    {
        auto env = info.Env();

        std::vector<std::wstring> productIds;
        if (info.Length() >= 1 && !info[0].IsNull() && !info[0].IsUndefined())
        {
            if (!info[0].IsArray())
            {
                throw Napi::TypeError::New(env, "getUnfulfilledConsumables requires an optional productIds string array.");
            }

            auto const productIdsArray = info[0].As<Napi::Array>();
            productIds.reserve(productIdsArray.Length());
            for (uint32_t index = 0; index < productIdsArray.Length(); ++index)
            {
                auto const value = productIdsArray.Get(index);
                if (!value.IsString())
                {
                    throw Napi::TypeError::New(env, "getUnfulfilledConsumables productIds must contain only strings.");
                }
                productIds.push_back(Utf8ToWide(value.As<Napi::String>().Utf8Value()));
            }
        }

        return std::make_shared<GetUnfulfilledConsumablesRequest>(env, std::move(productIds))->Start();
    }

    Napi::Value ReportConsumableFulfillment(Napi::CallbackInfo const& info)
    {
        auto env = info.Env();

        // reportConsumableFulfillment(productId, trackingId?, quantity?)
        // productId required for Windows.Services.Store ReportConsumableFulfillmentAsync.
        if (info.Length() < 1 || !info[0].IsString())
        {
            throw Napi::TypeError::New(env, "reportConsumableFulfillment requires a productId string.");
        }

        auto const productId = Utf8ToWide(info[0].As<Napi::String>().Utf8Value());

        winrt::guid trackingId{};
        if (info.Length() >= 2 && !info[1].IsNull() && !info[1].IsUndefined())
        {
            if (!info[1].IsString())
            {
                throw Napi::TypeError::New(env, "reportConsumableFulfillment trackingId must be a string when provided.");
            }

            auto const trackingIdText = info[1].As<Napi::String>().Utf8Value();
            if (!trackingIdText.empty())
            {
                trackingId = ParseGuid(trackingIdText);
            }
            else
            {
                trackingId = NewTrackingGuid();
            }
        }
        else
        {
            trackingId = NewTrackingGuid();
        }

        uint32_t quantity = 1;
        if (info.Length() >= 3 && !info[2].IsNull() && !info[2].IsUndefined())
        {
            if (!info[2].IsNumber())
            {
                throw Napi::TypeError::New(env, "reportConsumableFulfillment quantity must be a number when provided.");
            }
            auto const rawQuantity = info[2].As<Napi::Number>().Int64Value();
            if (rawQuantity <= 0 || rawQuantity > static_cast<int64_t>(UINT32_MAX))
            {
                throw Napi::TypeError::New(env, "reportConsumableFulfillment quantity must be a positive 32-bit integer.");
            }
            quantity = static_cast<uint32_t>(rawQuantity);
        }

        return std::make_shared<ReportConsumableFulfillmentRequest>(
            env,
            productId,
            quantity,
            trackingId)->Start();
    }

Napi::Object Init(Napi::Env env, Napi::Object exports)
{
    exports.Set("requestPurchase", Napi::Function::New(env, RequestPurchase));
    exports.Set("queryStoreStatus", Napi::Function::New(env, QueryStoreStatus));
    exports.Set("getUnfulfilledConsumables", Napi::Function::New(env, GetUnfulfilledConsumables));
    exports.Set("reportConsumableFulfillment", Napi::Function::New(env, ReportConsumableFulfillment));
    return exports;
}

NODE_API_MODULE(hagicode_store_purchase_addon, Init)
