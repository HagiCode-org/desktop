using Nuke.Common.Tooling;

/// <summary>
/// 构建路径模型
/// 统一管理构建过程中使用的各种路径
/// </summary>
internal static class BuildPaths
{
    /// <summary>
    /// 项目根目录
    /// </summary>
    internal static AbsolutePath RootDirectory => NukeBuild.RootDirectory;

    /// <summary>
    /// NukeBuild 脚本源目录
    /// </summary>
    internal static AbsolutePath NukeBuildScripts => RootDirectory / "nukeBuild" / "scripts";

    /// <summary>
    /// 获取平台特定的安装脚本路径
    /// </summary>
    /// <param name="platform">目标平台 ("linux", "windows", "macos")</param>
    /// <returns>安装脚本文件路径</returns>
    internal static string GetInstallScriptPath(string platform)
    {
        return platform.Equals("windows", StringComparison.OrdinalIgnoreCase) ? "install.bat" : "install.sh";
    }

    /// <summary>
    /// 获取平台特定的检查脚本路径
    /// </summary>
    /// <param name="platform">目标平台 ("linux", "windows", "macos")</param>
    /// <returns>检查脚本文件路径</returns>
    internal static string GetCheckScriptPath(string platform)
    {
        return platform.Equals("windows", StringComparison.OrdinalIgnoreCase) ? "check.bat" : "check.sh";
    }

    /// <summary>
    /// 获取平台特定的启动脚本路径（源文件名）
    /// </summary>
    /// <param name="platform">目标平台 ("linux", "windows", "macos")</param>
    /// <returns>启动脚本模板文件名</returns>
    internal static string GetStartScriptSourcePath(string platform)
    {
        return platform.Equals("windows", StringComparison.OrdinalIgnoreCase) ? "start.bat" : "start.sh";
    }

    /// <summary>
    /// 获取平台特定的启动脚本目标文件名
    /// </summary>
    /// <param name="platform">目标平台 ("linux", "windows", "macos")</param>
    /// <returns>启动脚本目标文件名 (start.sh 或 start.bat)</returns>
    internal static string GetStartScriptDestFileName(string platform)
    {
        return platform.Equals("windows", StringComparison.OrdinalIgnoreCase) ? "start.bat" : "start.sh";
    }

    /// <summary>
    /// 获取安装脚本的目标文件名（固定名称）
    /// </summary>
    /// <returns>安装脚本目标文件名 (install.sh 或 install.bat)</returns>
    internal static string GetInstallScriptDestFileName(string platform)
    {
        return platform.Equals("windows", StringComparison.OrdinalIgnoreCase) ? "install.bat" : "install.sh";
    }

    /// <summary>
    /// 获取检查脚本的目标文件名（固定名称）
    /// </summary>
    /// <returns>检查脚本目标文件名 (check.sh 或 check.bat)</returns>
    internal static string GetCheckScriptDestFileName(string platform)
    {
        return platform.Equals("windows", StringComparison.OrdinalIgnoreCase) ? "check.bat" : "check.sh";
    }
}
