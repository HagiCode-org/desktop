#include <napi.h>

#include <windows.h>
#include <shobjidl_core.h>

#include <optional>
#include <memory>
#include <sstream>
#include <stdexcept>
#include <string>
#include <utility>

#include <winrt/base.h>
#include <winrt/Windows.Foundation.h>
#include <winrt/Windows.Services.Store.h>

namespace
{
    using winrt::Windows::Foundation::AsyncStatus;
    using winrt::Windows::Services::Store::StoreContext;
    using winrt::Windows::Services::Store::StorePurchaseResult;
    using winrt::Windows::Services::Store::StorePurchaseStatus;

    struct PurchaseCompletion
    {
        std::string outcome{ "failed" };
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

    std::string MapOutcome(StorePurchaseStatus const status)
    {
        switch (status)
        {
        case StorePurchaseStatus::Succeeded:
            return "succeeded";
        case StorePurchaseStatus::AlreadyPurchased:
            return "already-purchased";
        case StorePurchaseStatus::NotPurchased:
            return "canceled";
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
            result.Set("errorCode", completion.errorCode ? Napi::String::New(env, *completion.errorCode) : env.Null());
            result.Set("errorMessage", completion.errorMessage ? Napi::String::New(env, *completion.errorMessage) : env.Null());
            deferred_.Resolve(result);
        }

        Napi::Value BuildErrorValue(
            std::optional<std::string> const& errorCode,
            std::optional<std::string> const& errorMessage) const
        {
            auto error = Napi::Object::New(env_);
            error.Set("code", errorCode ? Napi::String::New(env_, *errorCode) : env_.Null());
            error.Set("message", errorMessage ? Napi::String::New(env_, *errorMessage) : env_.Null());
            return error;
        }

        Napi::Env env_;
        Napi::Promise::Deferred deferred_;
        Napi::ThreadSafeFunction threadsafeFunction_;
        std::wstring storeId_;
        HWND ownerWindow_{ nullptr };
    };

    Napi::Value RequestPurchase(Napi::CallbackInfo const& info)
    {
        auto env = info.Env();

        if (info.Length() < 1 || !info[0].IsString())
        {
            throw Napi::TypeError::New(env, "requestPurchase requires a Store ID string.");
        }

        auto const storeIdUtf8 = info[0].As<Napi::String>().Utf8Value();
        std::wstring const storeId(storeIdUtf8.begin(), storeIdUtf8.end());
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
}

Napi::Object Init(Napi::Env env, Napi::Object exports)
{
    exports.Set("requestPurchase", Napi::Function::New(env, RequestPurchase));
    return exports;
}

NODE_API_MODULE(hagicode_store_purchase_addon, Init)
