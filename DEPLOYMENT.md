# Deployment Guide — Clinical Decision Support System for Osteoporosis Screening

Deploy the whole stack for **free** in ~15 minutes:

| Layer        | Platform                          | Free tier                          |
| ------------ | --------------------------------- | ---------------------------------- |
| Backend API  | **Render** (Docker Web Service)   | 750h/month · auto-sleep after 15 min idle |
| Frontend UI  | **Vercel** (Next.js)              | 100 GB bandwidth · unlimited sites |
| Git          | **GitHub**                        | Unlimited public repos             |

> **Note**: Render's free tier spins the container down after 15 min of inactivity.
> First request after sleep takes ~30 s to wake. For always-on hosting consider
> Fly.io (3 VMs free), Hugging Face Spaces (Docker), or upgrade to Render Starter ($7/mo).

---

## 0 · Pre-flight checklist

```
c:\mark1
├─ backend\
│  ├─ Dockerfile             ← prod container
│  ├─ .dockerignore
│  ├─ .env.example
│  ├─ app\main.py            ← env-driven CORS + JWT
│  ├─ requirements.txt       ← opencv-python-headless
│  ├─ scripts\import_bmd.py
│  └─ uploads\BMD\{Normal,Osteopenia,Osteoporosis}\<HN>\…  (84 MB)
├─ frontend\
│  ├─ .env.example
│  └─ lib\api.ts             ← reads NEXT_PUBLIC_API_BASE
├─ render.yaml               ← 1-click Render Blueprint
└─ .gitignore
```

Everything you need is already in place — no code edits required.

---

## 1 · Push the repo to GitHub

From `c:\mark1`:

```powershell
git init
git branch -M main
git add .
git commit -m "Initial deploy — CDSS Osteoporosis Screening"

# Create a new repo on https://github.com/new (do NOT add README/gitignore)
git remote add origin https://github.com/<YOUR_USERNAME>/cdss-osteoporosis.git
git push -u origin main
```

If the push is rejected for being too large, install Git LFS for the BMD folder:

```powershell
git lfs install
git lfs track "backend/uploads/BMD/**/*"
git add .gitattributes backend/uploads/BMD
git commit -m "chore: track BMD library with LFS"
git push
```

---

## 2 · Deploy the backend on Render (Docker)

### Option A — 1-click Blueprint (recommended)

1. Go to <https://dashboard.render.com/blueprints> → **New Blueprint Instance**.
2. Connect your GitHub repo. Render detects `render.yaml` and creates a
   service named **`cdss-osteoporosis-api`** (Docker, free plan, Singapore region).
3. Click **Apply**. Build takes ~5 minutes (OpenCV + numpy + scikit-learn).
4. Once green, copy the public URL — it looks like
   `https://cdss-osteoporosis-api.onrender.com`.
5. Smoke-test:

   ```powershell
   curl https://cdss-osteoporosis-api.onrender.com/health
   # → {"status":"ok"}
   ```

6. Seed the admin user + import the BMD library (one-time):

   ```powershell
   curl -X POST https://cdss-osteoporosis-api.onrender.com/seed-admin
   # Login once from the UI, then click "Import BMD Library" in the X-ray view.
   ```

### Option B — manual service

If you prefer to configure by hand:

- **New → Web Service → Docker**
- Repository: your GitHub repo
- Root Directory: `backend`
- Dockerfile Path: `Dockerfile`
- Region: any (Singapore is closest to Thailand)
- Plan: **Free**
- Health Check Path: `/health`
- Environment variables:

  | Key                    | Value                              |
  | ---------------------- | ---------------------------------- |
  | `PORT`                 | `8000`                             |
  | `ALLOWED_ORIGINS`      | *(leave blank for now, fill in after step 3)* |
  | `ALLOWED_ORIGIN_REGEX` | `https://.*\.vercel\.app`          |
  | `JWT_SECRET`           | *(use Render "Generate Value")*    |

---

## 3 · Deploy the frontend on Vercel

1. Go to <https://vercel.com/new> → **Import** your GitHub repo.
2. **Root Directory**: `frontend`
3. Framework Preset auto-detects **Next.js**.
4. Add an environment variable:

   | Key                     | Value                                               |
   | ----------------------- | --------------------------------------------------- |
   | `NEXT_PUBLIC_API_BASE`  | `https://cdss-osteoporosis-api.onrender.com`        |

5. Click **Deploy**. Build takes ~1 minute.
6. Copy the production URL, e.g. `https://cdss-osteoporosis.vercel.app`.

---

## 4 · Allow the Vercel URL in the backend CORS

Back in Render → service → **Environment** tab:

- Update `ALLOWED_ORIGINS` to your Vercel URL(s):

  ```
  https://cdss-osteoporosis.vercel.app,https://cdss-osteoporosis-git-main-<you>.vercel.app
  ```

  (Previews are already covered by the `*.vercel.app` regex.)

- Click **Save, Rebuild & Deploy** — takes ~30 s to apply.

---

## 5 · First-time setup from the UI

1. Open your Vercel URL in a browser.
2. Login with `admin` / `admin1234` (auto-created via `/seed-admin`).
3. Go to **X-ray Studies** → click **⬇ Import BMD Library**.
4. Wait for the summary modal:
   - Patients created: 37
   - Images imported: 111
   - Classes: Normal 15 · Osteopenia 11 · Osteoporosis 11
5. Pick a patient → thumbnails appear in **Study Series** → click any study to
   view it with zoom / fullscreen / ROI overlay.
6. Run **AI Prediction** to get the hybrid-v1 score.

---

## 6 · Auto-deploy on every push

Both Render and Vercel subscribe to the `main` branch. Any commit you push
triggers a rebuild automatically — no extra setup needed.

---

## 7 · Optional upgrades

| Concern                         | Free upgrade                                                                  |
| ------------------------------- | ----------------------------------------------------------------------------- |
| Render free tier sleeps         | Add an [UptimeRobot](https://uptimerobot.com) ping every 5 min                |
| SQLite resets on redeploy       | Attach a Render persistent disk (starts at $1/mo) or switch to Postgres (free on Render) |
| Need persistent uploads         | Use an object store (Cloudflare R2 / Backblaze B2 free tier) and update `UPLOAD_DIR` |
| Custom domain                   | Vercel + Render both offer free HTTPS on custom domains                       |
| Faster cold start               | Move backend to Fly.io free tier (no sleep)                                   |

---

## 8 · Troubleshooting

| Symptom                                | Fix                                                                                      |
| -------------------------------------- | ---------------------------------------------------------------------------------------- |
| `net::ERR_FAILED` from browser         | Backend CORS — add your Vercel URL to `ALLOWED_ORIGINS` and redeploy                     |
| Images 404 on Render                   | Make sure `uploads/BMD/` is committed (not gitignored) or use Git LFS                    |
| Render build fails on opencv           | Verify `opencv-python-headless` in `backend/requirements.txt`                            |
| Vercel build "Module not found"        | Set **Root Directory** to `frontend` in the project settings                             |
| `401 Unauthorized` after working login | `JWT_SECRET` changed → log out + log back in                                             |

Good luck — and ship it!
