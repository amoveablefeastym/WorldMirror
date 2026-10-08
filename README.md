# WorldMirror: self-hosted study version

This is the WorldMirror prototype set up to run on your own website, so anyone with the link can use it without a Claude account. The AI calls go through a small server function that holds your Anthropic API key.

## What's in this folder

| File | What it does |
|---|---|
| `index.html` | The full WorldMirror page. |
| `api/claude.js` | Forwards the page's AI requests to the Anthropic API. Your API key lives here, on the server. |
| `api/log.js` | Receives each session's log for the research team. |
| `api/config.js` | Tells the page whether to ask for a study code. |
| `api/_shared.js` | Study-code check and a basic rate limit. |
| `vercel.json` | Gives the AI function up to 120 seconds, since generating places can take about a minute. |
| `google-sheet-logger.gs` | Optional. Saves every session as a row in a Google Sheet. |

## Deploy on Vercel

1. **Get an API key.** Create one in the Anthropic Console (console.anthropic.com). While you're there, set a monthly spend limit for the key's workspace.
2. **Put this folder in a GitHub repo**, then in Vercel choose *Add New Project*, import the repo, and leave the framework preset as *Other*. (Or run `npx vercel` inside this folder.)
3. **Add environment variables** in the Vercel project settings:

   | Name | Required? | Value |
   |---|---|---|
   | `ANTHROPIC_API_KEY` | Yes | Your API key |
   | `STUDY_CODE` | Strongly recommended | Any word, for example `delta-fall26`. Without it, anyone who finds the URL can run up your bill. |
   | `LOG_WEBHOOK_URL` | Optional | The Google Apps Script URL, if you set up the Sheet logger below |
   | `MODEL_DEFAULT` | Optional | Model for places, refinement, and synthesis. Default `claude-sonnet-5-5` |
   | `MODEL_QUICK` | Optional | Model for answering questions. Default `claude-haiku-4-5-20251001` |
   | `REQUESTS_PER_MINUTE` | Optional | Per-visitor limit on AI requests. Default 20 |

4. **Redeploy** after adding or changing variables, so they take effect.

To try it on your own computer first, run `npx vercel dev` in this folder.

## Sharing links with participants

```
https://your-project.vercel.app/?pid=P01&code=delta-fall26
```

- `pid` tags every log from that session with a participant ID.
- `code` fills in the study code so participants never see the field. Leave it out if you want them to type it.

## Where the data goes

The page sends the full session log (problem statements, every refinement, places shown, notes, questions and answers, cause guesses and the participant's answers, check-in choices, time spent) at each check-in choice, each synthesis step, when the summary is saved, and when the tab closes.

- **Vercel logs:** every log is printed with the prefix `SESSION_LOG`. Vercel only keeps these for a short time, so don't rely on them for a study.
- **Google Sheet (recommended):** follow the steps at the top of `google-sheet-logger.gs`, then put its URL in `LOG_WEBHOOK_URL`. Each event becomes a row, with the full log as JSON in the last column. Logs from the same session share a `session_id`, and the latest row has the most complete data.

## Things to know

- **Consent.** Participants' text is sent to Anthropic's API and saved to your logs. The page says so on the first screen, but make sure your consent materials say it too.
- **Cost.** A typical session makes roughly a dozen requests. Most are small, but each set of places is a long response. Watch usage in the Anthropic Console for the first few sessions.
- **The study code matters.** The server forwards whatever prompt the page sends, so anyone with the URL and the code could use it as a general Claude endpoint. Keep the code to your participants and change it between studies.
- **Timeouts.** If generating places fails on Vercel with a timeout, check the function duration limit on your Vercel plan and adjust `maxDuration` in `vercel.json`.
- **Model names.** If a default model is retired, set `MODEL_DEFAULT` or `MODEL_QUICK` to a current one from the Anthropic docs. No code change needed.
