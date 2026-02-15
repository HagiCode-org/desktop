using AzureStorage;

namespace Adapters;

/// <summary>
/// Azure Blob Storage 适配器接口
/// 封装 Azure Blob Storage 上传操作
/// </summary>
public interface IAzureBlobAdapter
{
    /// <summary>
    /// 验证 SAS URL 的有效性
    /// </summary>
    /// <param name="sasUrl">Azure Blob SAS URL</param>
    /// <returns>SAS URL 是否有效</returns>
    Task<bool> ValidateSasUrlAsync(string sasUrl);

    /// <summary>
    /// 上传构建产物到 Azure Blob Storage
    /// </summary>
    /// <param name="filePaths">文件路径列表</param>
    /// <param name="options">发布配置选项</param>
    /// <returns>上传结果</returns>
    Task<AzureBlobPublishResult> UploadArtifactsAsync(List<string> filePaths, AzureBlobPublishOptions options);

    /// <summary>
    /// 生成 index.json 索引文件
    /// </summary>
    /// <param name="options">发布配置选项</param>
    /// <param name="minify">是否压缩 JSON 输出（移除空白字符）</param>
    /// <returns>索引 JSON 内容</returns>
    Task<string> GenerateIndexJsonAsync(AzureBlobPublishOptions options, bool minify = false);

    /// <summary>
    /// 仅生成 index.json 索引文件并保存到本地
    /// </summary>
    /// <param name="options">发布配置选项</param>
    /// <param name="outputPath">本地输出文件路径</param>
    /// <param name="minify">是否压缩 JSON 输出</param>
    /// <returns>索引 JSON 内容</returns>
    Task<string> GenerateIndexOnlyAsync(AzureBlobPublishOptions options, string outputPath, bool minify = false);

    /// <summary>
    /// 从本地文件读取并上传 index.json
    /// </summary>
    /// <param name="options">发布配置选项</param>
    /// <param name="localIndexPath">本地 index.json 文件路径</param>
    /// <returns>上传是否成功</returns>
    Task<bool> UploadIndexOnlyAsync(AzureBlobPublishOptions options, string localIndexPath);

    /// <summary>
    /// 验证生成的 index 文件完整性
    /// </summary>
    /// <param name="localIndexPath">本地 index.json 文件路径</param>
    /// <returns>验证是否通过</returns>
    Task<bool> ValidateIndexFileAsync(string localIndexPath);

    /// <summary>
    /// 上传 index.json 到 Azure Blob Storage
    /// </summary>
    /// <param name="options">发布配置选项</param>
    /// <param name="indexJson">索引 JSON 内容</param>
    /// <returns>上传是否成功</returns>
    Task<bool> UploadIndexJsonAsync(AzureBlobPublishOptions options, string indexJson);
}
