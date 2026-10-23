# Game film tools

Everything for adding and publishing game film runs from this repo. The old `dfc-game-film` repo is retired.

Working files live in `private/film/`. It is git-ignored and stays on the coach's PC:

| Path                                                      | What                                                                 |
| --------------------------------------------------------- | -------------------------------------------------------------------- |
| `.manager.json`                                           | Supabase url, service_role key, teamId, timeZone                     |
| `.r2.json`                                                | the private clips bucket (`clipsBucket`)                             |
| `.keeper-password`                                        | only for the one-time `move-keeper`                                  |
| `data/games/<slug>.json`                                  | one file per game, English and Spanish (shape: `src/film/schema.ts`) |
| `data/roster.json`, `data/lineups.json`, `data/site.json` | squad, who played where, team short name                             |
| `data/ollie/`                                             | Ollie Sports history (`film:ollie`)                                  |
| `clips/<slug>/<id>.mp4`                                   | highlight clips (`make_highlights.py`)                               |
| `ollie-web/`, `.ollie-profile/`                           | the saved Ollie web app and its signed-in browser profile            |

## Adding a game

1. **Get the tape.** From Reeplayer: `npm run film:tape -- <share link>`. From YouTube: `python -m yt_dlp --js-runtimes node --remote-components ejs:github -f 137+140 --merge-output-format mp4 -o "<folder>/full_game.%(ext)s" <url>`. The video's chapters give the kick-offs and water breaks.
2. **Find the moments.** Use `python tools/film/scan_tape.py cues <video>` for whistles and crowd peaks, `sheets` for contact sheets, and `chunks` for the five-minute working clips and the game file's `video.workingClips`.
3. **Write `data/games/<slug>.json`.** Copy a similar game as the template. Name people by position only. Ollie (`data/ollie/history.json`) is the authority for score, goal minutes, shots, possession and cards. For Spanish, `npm run film:i18n -- export <slug>` writes the strings to translate, and `import` writes them back.
4. **Cut the clips.** Set `highlights.source` and list the clips, then run `python tools/film/make_highlights.py --game <slug>`. Add `--cpu` if the PC has no NVIDIA GPU.
5. **Check:** `npm run film:validate`.
6. **Publish:** `npm run film -- publish`. Add `--dry-run` first to see what would change. This writes the game into the film tables, links it to the schedule entry and uploads the clips.
7. **Optionally** run `npm run film -- stats` to refresh the players' season numbers.

If the scorekeeper logged the game, run `npm run film -- keeper pull <game> --as <slug>` before writing the file. It writes the moments to `data/raw/<slug>-live.json` and the lineup to `lineups.json`.

## Other commands

`npm run film -- teams | roster | check | keeper games | keeper forget <game> | move-keeper`. The top of `film.ts` describes each one. `npm run film:ollie` pulls the latest Ollie history.
