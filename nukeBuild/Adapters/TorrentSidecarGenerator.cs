using System.Security.Cryptography;
using Utils;

namespace Adapters;

public sealed class TorrentSidecarRequest
{
    public required string SourcePath { get; init; }
    public required string SidecarPath { get; init; }
    public required string DisplayName { get; init; }
    public required IReadOnlyList<string> WebSeeds { get; init; }
    public string CreatedBy { get; init; } = "HagiCode Desktop";
}

public sealed class TorrentSidecarResult
{
    public required string SidecarPath { get; init; }
    public required string InfoHash { get; init; }
}

public interface ITorrentSidecarGenerator
{
    Task<TorrentSidecarResult> GenerateAsync(TorrentSidecarRequest request);
}

public sealed class TorrentSidecarGenerator : ITorrentSidecarGenerator
{
    private readonly int _pieceLengthBytes;

    public TorrentSidecarGenerator(int pieceLengthBytes = HybridDistributionConstants.DefaultPieceLengthBytes)
    {
        if (pieceLengthBytes <= 0)
        {
            throw new ArgumentOutOfRangeException(nameof(pieceLengthBytes));
        }

        _pieceLengthBytes = pieceLengthBytes;
    }

    public async Task<TorrentSidecarResult> GenerateAsync(TorrentSidecarRequest request)
    {
        if (!File.Exists(request.SourcePath))
        {
            throw new FileNotFoundException("Source artifact not found", request.SourcePath);
        }

        if (request.WebSeeds.Count == 0)
        {
            throw new InvalidOperationException("At least one web seed is required to generate a trackerless torrent sidecar.");
        }

        var pieces = await ComputePieceHashesAsync(request.SourcePath);
        var fileInfo = new FileInfo(request.SourcePath);
        var infoDictionary = new SortedDictionary<string, object?>(StringComparer.Ordinal)
        {
            ["length"] = fileInfo.Length,
            ["name"] = request.DisplayName,
            ["piece length"] = _pieceLengthBytes,
            ["pieces"] = pieces,
        };

        var infoBytes = Bencode(infoDictionary);
        var infoHash = Convert.ToHexString(SHA1.HashData(infoBytes)).ToLowerInvariant();

        // 首版保持 trackerless，只依赖 .torrent + webSeeds + DHT/LSD。
        var torrentDictionary = new SortedDictionary<string, object?>(StringComparer.Ordinal)
        {
            ["comment"] = "Trackerless hybrid distribution via DHT/LSD + webSeeds",
            ["created by"] = request.CreatedBy,
            ["creation date"] = DateTimeOffset.UtcNow.ToUnixTimeSeconds(),
            ["info"] = new RawBencodedValue(infoBytes),
            ["url-list"] = request.WebSeeds.Count == 1
                ? request.WebSeeds[0]
                : request.WebSeeds.Cast<object?>().ToList(),
        };

        var torrentBytes = Bencode(torrentDictionary);
        var sidecarDirectory = Path.GetDirectoryName(request.SidecarPath);
        if (!string.IsNullOrWhiteSpace(sidecarDirectory))
        {
            Directory.CreateDirectory(sidecarDirectory);
        }

        await File.WriteAllBytesAsync(request.SidecarPath, torrentBytes);

        return new TorrentSidecarResult
        {
            SidecarPath = request.SidecarPath,
            InfoHash = infoHash,
        };
    }

    private async Task<byte[]> ComputePieceHashesAsync(string sourcePath)
    {
        var pieceHashes = new List<byte[]>();
        var buffer = new byte[_pieceLengthBytes];

        await using var stream = File.OpenRead(sourcePath);
        while (true)
        {
            var read = await stream.ReadAsync(buffer, 0, buffer.Length);
            if (read <= 0)
            {
                break;
            }

            byte[] pieceHash;
            if (read == buffer.Length)
            {
                pieceHash = SHA1.HashData(buffer);
            }
            else
            {
                var partial = buffer.AsSpan(0, read).ToArray();
                pieceHash = SHA1.HashData(partial);
            }

            pieceHashes.Add(pieceHash);
        }

        return pieceHashes.SelectMany((hash) => hash).ToArray();
    }

    private static byte[] Bencode(object? value)
    {
        using var stream = new MemoryStream();
        WriteBencodedValue(stream, value);
        return stream.ToArray();
    }

    private static void WriteBencodedValue(Stream stream, object? value)
    {
        switch (value)
        {
            case null:
                throw new InvalidOperationException("Cannot bencode null values.");
            case RawBencodedValue raw:
                stream.Write(raw.Bytes);
                return;
            case byte[] bytes:
                WriteBytes(stream, bytes);
                return;
            case string text:
                WriteBytes(stream, Encoding.UTF8.GetBytes(text));
                return;
            case int intValue:
                WriteInteger(stream, intValue);
                return;
            case long longValue:
                WriteInteger(stream, longValue);
                return;
            case IReadOnlyList<string> stringList:
                stream.WriteByte((byte)'l');
                foreach (var item in stringList)
                {
                    WriteBencodedValue(stream, item);
                }
                stream.WriteByte((byte)'e');
                return;
            case IEnumerable<object?> list:
                stream.WriteByte((byte)'l');
                foreach (var item in list)
                {
                    WriteBencodedValue(stream, item);
                }
                stream.WriteByte((byte)'e');
                return;
            case IDictionary<string, object?> dictionary:
                stream.WriteByte((byte)'d');
                foreach (var (key, entryValue) in dictionary.OrderBy((entry) => entry.Key, StringComparer.Ordinal))
                {
                    WriteBencodedValue(stream, key);
                    WriteBencodedValue(stream, entryValue);
                }
                stream.WriteByte((byte)'e');
                return;
            default:
                throw new InvalidOperationException($"Unsupported bencode value type: {value.GetType().FullName}");
        }
    }

    private static void WriteBytes(Stream stream, byte[] bytes)
    {
        var prefix = Encoding.ASCII.GetBytes($"{bytes.Length}:");
        stream.Write(prefix);
        stream.Write(bytes);
    }

    private static void WriteInteger(Stream stream, long value)
    {
        var encoded = Encoding.ASCII.GetBytes($"i{value}e");
        stream.Write(encoded);
    }

    private sealed class RawBencodedValue
    {
        public RawBencodedValue(byte[] bytes)
        {
            Bytes = bytes;
        }

        public byte[] Bytes { get; }
    }
}
