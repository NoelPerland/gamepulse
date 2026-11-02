using System;
using System.Collections;
using System.Collections.Generic;
using System.Text;
using UnityEngine;
using UnityEngine.Networking;

// Attach to persistent GameObject. Ship events through a trusted relay in a public game:
// an ingestion key embedded in a player binary can be extracted.
public class GamePulseClient : MonoBehaviour
{
    [SerializeField] string endpoint = "http://127.0.0.1:3043";
    [SerializeField] string developmentWriteKey = "";
    const int MaxQueuedEvents = 256;
    const int BatchSize = 20;
    readonly Queue<string> pending = new Queue<string>();
    bool sending;
    string playerId, sessionId;
    [Serializable] class Payload { public string id, kind, player, session, level, at; }
    [Serializable] public class Tuning { public string difficulty, eventBanner; public float bonusXp; }
    [Serializable] public class Config { public int version; public Tuning value; }
    public Config CurrentConfig { get; private set; }

    void Awake()
    {
        playerId = PlayerPrefs.GetString("gamepulse.player", "");
        if (playerId == "") { playerId = Guid.NewGuid().ToString("N"); PlayerPrefs.SetString("gamepulse.player", playerId); PlayerPrefs.Save(); }
        sessionId = Guid.NewGuid().ToString("N");
    }
    void Start() { Track("session_start"); StartCoroutine(RefreshConfig()); }
    public void Track(string kind, string level = "")
    {
        var body = JsonUtility.ToJson(new Payload { id = Guid.NewGuid().ToString(), kind = kind, player = playerId, session = sessionId, level = level, at = DateTime.UtcNow.ToString("o") });
        if (pending.Count >= MaxQueuedEvents) { Debug.LogWarning("GamePulse queue full; dropping incoming event."); return; }
        pending.Enqueue(body);
        if (!sending) StartCoroutine(Drain());
    }
    IEnumerator Drain()
    {
        sending = true;
        while (pending.Count > 0)
        {
            var batch = new List<string>(BatchSize);
            while (batch.Count < BatchSize && pending.Count > 0) batch.Add(pending.Dequeue());
            // Serialize each event once so ambiguous network failures can retry the same IDs.
            yield return Send("[" + string.Join(",", batch) + "]");
        }
        sending = false;
    }
    IEnumerator Send(string body)
    {
        for (int attempt = 0; attempt < 3; attempt++)
        {
            using (var req = new UnityWebRequest(endpoint.TrimEnd('/') + "/api/events", "POST"))
            {
                req.uploadHandler = new UploadHandlerRaw(Encoding.UTF8.GetBytes(body)); req.downloadHandler = new DownloadHandlerBuffer();
                req.timeout = 10; req.SetRequestHeader("Content-Type", "application/json"); req.SetRequestHeader("Authorization", "Bearer " + developmentWriteKey);
                yield return req.SendWebRequest();
                if (req.result == UnityWebRequest.Result.Success) yield break;
                if (req.responseCode >= 400 && req.responseCode < 500 && req.responseCode != 408 && req.responseCode != 429) { Debug.LogWarning("GamePulse rejected event: " + req.responseCode); yield break; }
            }
            yield return new WaitForSecondsRealtime(1 << attempt);
        }
        Debug.LogWarning("GamePulse unavailable; event was not delivered.");
    }
    public IEnumerator RefreshConfig()
    {
        using (var req = UnityWebRequest.Get(endpoint.TrimEnd('/') + "/api/config"))
        {
            req.timeout = 10; yield return req.SendWebRequest();
            if (req.result == UnityWebRequest.Result.Success) CurrentConfig = JsonUtility.FromJson<Config>(req.downloadHandler.text);
        }
    }
}
