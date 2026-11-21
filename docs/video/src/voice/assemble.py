"""assemble.py - lay the nine narration clips on one 177.5 s track with fixed pauses.

Run from the composition directory, after synthesising each clip with Kokoro:

    for i in 1 2 3 4 5 6 7 8 9; do
      npx hyperframes tts src/voice/s$i.txt -v af_heart -o assets/vo/s$i.wav
    done
    python3 src/voice/assemble.py 1.0,1.0,1.0,1.0,1.0,1.0,1.0,1.0 0.7

Arguments: the eight pauses between clips, then the lead-in, in seconds. Writes
assets/voiceover.wav and src/voice/vo-timing.json (each clip's start and length,
which the scene hosts in src/scenes/ follow).
"""
import json
import subprocess
import sys

TOTAL = 177.5
gaps = [float(x) for x in sys.argv[1].split(",")]
lead = float(sys.argv[2])
durs = [
    float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f"assets/vo/s{i}.wav"]).decode())
    for i in range(1, 10)
]
t, starts = lead, []
for i, d in enumerate(durs):
    starts.append(round(t, 3))
    t += d + (gaps[i] if i < 8 else 0)
print("starts", starts, "speech ends", round(starts[-1] + durs[-1], 2))
json.dump({"durs": durs, "starts": starts}, open("src/voice/vo-timing.json", "w"), indent=1)
inputs, filt = [], []
for i, s in enumerate(starts):
    ms = int(s * 1000)
    inputs += ["-i", f"assets/vo/s{i + 1}.wav"]
    filt.append(f"[{i}:a]aresample=48000,adelay={ms}|{ms}[a{i}]")
filt.append("".join(f"[a{i}]" for i in range(9)) + f"amix=inputs=9:normalize=0,apad=whole_dur={TOTAL}[out]")
subprocess.check_call(["ffmpeg", "-y", "-v", "error", *inputs, "-filter_complex", ";".join(filt), "-map", "[out]", "-t", str(TOTAL), "-ac", "1", "assets/voiceover.wav"])
