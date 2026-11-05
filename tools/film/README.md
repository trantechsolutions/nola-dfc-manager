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

## Computer vision (pilot)

Runs on the GPU in its own Python env, `private/film/.venv` (PyTorch for CUDA 12.8, ultralytics), with models in `private/film/models/`. Nothing leaves the PC.

- `private/film/.venv/Scripts/python tools/film/cv_pilot.py <slug> --from 0:00 --len 5:00` follows the players and the ball over a stretch and writes rough possession, passes and turnovers, plus a marked-up video, to `data/raw/<slug>-cv/`.
- `private/film/.venv/Scripts/python tools/film/cv_label.py` is the ball labelling screen. It saves to `data/cv/ball/` for training a ball detector on our own footage.
- `cv_goals.py` is the goal labelling screen over the same pictures (two clicks a goal). With it, `cv_train.py` also teaches the detector to see goals.
- `cv_train.py` trains our own player-and-ball detector (`models/ball.pt`) from those labels.
- `cv_shots.py find | review | apply` counts shots, shots on target and saves. The model flags candidate strikes near a goal (about an hour a game), the coach says on a review screen what each one was (about 5 minutes), and apply writes the table into the match report. Goals are checked against the logged goals: a logged goal the model missed is still counted, and each goal takes the scorer from the log.
- `cv_game.py prepare | confirm | run | apply | report` does whole games: learns each game's kits, has the coach mark which look-alike group is DFC and which the opponent, runs both halves, writes the estimates into the match report and prints the season table. A game where the model can't tell the kits apart is marked unsure, and the app shows its numbers with an asterisk and leaves them out of the averages. The top of the file has the details.
- `npm run film:vision -- <slug>` is the paid alternative: Claude follows the play frame by frame (needs an Anthropic API key).

## Other commands

`npm run film -- teams | roster | check | keeper games | keeper forget <game> | move-keeper`. The top of `film.ts` describes each one. `npm run film:ollie` pulls the latest Ollie history.
