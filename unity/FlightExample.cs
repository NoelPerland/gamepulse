using UnityEngine;

// Wire these public methods to your game's existing lifecycle and level UI.
public class FlightExample : MonoBehaviour
{
    [SerializeField] GamePulseClient telemetry;
    public void EnterLevel(string level) => telemetry.Track("level_start", level);
    public void RecordDeath(string level) => telemetry.Track("death", level);
    public void ClearLevel(string level) => telemetry.Track("level_complete", level);
    public void EndSession() => telemetry.Track("session_end");
    public int AwardXp(int baseXp) => Mathf.RoundToInt(baseXp * (telemetry.CurrentConfig?.value?.bonusXp ?? 1f));
}
