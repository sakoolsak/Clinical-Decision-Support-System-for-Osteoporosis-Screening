# Hospital Osteoporosis Web Application

ระบบ Web Application สำหรับโรงพยาบาล (FastAPI + Next.js) ที่รองรับ:

- Upload ภาพ X-ray
- กรอกและจัดการข้อมูลผู้ป่วย (CRUD)
- Predict ความเสี่ยงโรค Osteoporosis
- แสดงผล Risk Score และ Visualization
- Authentication + Role-based Authorization (`admin`, `doctor`, `nurse`)
- ใช้ SweetAlert2 ในฝั่ง Frontend

## Architecture

- `backend/` FastAPI API + SQLite + ML inference
- `frontend/` Next.js dashboard UI
- `backend/scripts/data_engineering.py` จำลอง EMR integration และสร้างไฟล์ `OsteoporosisUPDataset.csv`
- `backend/scripts/train_hybrid.py` สำหรับ train/evaluate hybrid tabular model
- `backend/scripts/train_image_cnn.py` สำหรับ CNN image pipeline (ROI + feature extraction)

## Task 1: Data Engineering

ไฟล์หลัก: `backend/data/OsteoporosisUPDataset.csv`

ประกอบด้วยข้อมูล spine BMD ต่อผู้ป่วยด้วยรหัส HN และฟีเจอร์ทางคลินิก เช่น:

- `hn`
- `age`, `gender`, `bmi`
- `smoking`, `steroid_use`
- `spine_bmd`
- `osteoporosis_label`

## Task 2: Machine Learning

### Hybrid model

- Train/Test split (stratified)
- Cross-validation (StratifiedKFold)
- Class imbalance handling (SMOTE + class_weight)
- Evaluation metrics: Accuracy, F1-score, AUC

### Image model

- CNN (TensorFlow/Keras)
- ROI extraction จาก spine region
- Feature extraction จากภาพ grayscale

## Run Backend

```bash
cd backend
pip install -r requirements.txt
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

## Run Frontend

```bash
cd frontend
npm install
npm run dev
```

เปิดใช้งานที่:

- Frontend: `http://localhost:3000`
- Backend API: `http://localhost:8000/docs`

## Default Admin

กด login หน้าเว็บได้ทันทีด้วย:

- username: `admin`
- password: `admin1234`

ระบบจะสร้าง admin อัตโนมัติผ่าน endpoint `/seed-admin`

## Free Public Hosting (GitHub Pages)

You can host the frontend publicly for free using GitHub Pages.

1. In your GitHub repository, open **Settings -> Pages**.
2. Set **Build and deployment** source to **GitHub Actions**.
3. In **Settings -> Secrets and variables -> Actions -> Variables**, add:
   - `NEXT_PUBLIC_API_BASE` = your public backend URL (for example Render/Fly URL)
4. Push to `main` (or run the workflow manually) and wait for workflow
   `Deploy Frontend to GitHub Pages` to finish.
5. Public website URL will be:
   `https://<github-username>.github.io/Clinical-Decision-Support-System-for-Osteoporosis-Screening/`

> Note: GitHub Pages hosts static frontend only. The FastAPI backend must be hosted separately.
# Clinical-Decision-Support-System-for-Osteoporosis-Screening
