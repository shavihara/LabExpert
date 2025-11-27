import uuid
import os
import shutil
import json
from datetime import datetime
from config.database import prepare

class FileService:
    @staticmethod
    def ensure_user_directories(user_id):
        base_dir = os.path.join(os.path.dirname(__file__), '../../uploads/users', user_id)
        profile_dir = os.path.join(base_dir, 'profile')
        documents_dir = os.path.join(base_dir, 'documents')
        for dir_path in [base_dir, profile_dir, documents_dir]:
            os.makedirs(dir_path, exist_ok=True)
        return {'base_dir': base_dir, 'profile_dir': profile_dir, 'documents_dir': documents_dir}

    @staticmethod
    def save_profile_picture(file, user_id):
        dirs = FileService.ensure_user_directories(user_id)
        profile_dir = dirs['profile_dir']
        stmt = prepare("SELECT * FROM files WHERE user_id = :user_id AND file_type = 'profile_picture' AND is_active = 1")
        existing = stmt({"user_id": user_id}).fetchone()
        if existing:
            FileService.delete_file(existing['id'])
        file_id = str(uuid.uuid4())
        ext = os.path.splitext(file.filename)[1]
        filename = f"profile-{int(datetime.timestamp(datetime.utcnow()))}{ext}"
        file_path = os.path.join(profile_dir, filename)
        with open(file_path, "wb") as f:
            shutil.copyfileobj(file.file, f)
        insert_stmt = prepare("""
            INSERT INTO files (id, user_id, file_type, original_name, filename, file_path, mimetype, size)
            VALUES (:id, :user_id, :file_type, :original_name, :filename, :file_path, :mimetype, :size)
        """)
        insert_stmt({
            "id": file_id, "user_id": user_id, "file_type": 'profile_picture',
            "original_name": file.filename, "filename": filename, "file_path": file_path,
            "mimetype": file.content_type, "size": file.size
        })
        return {"id": file_id, "filename": filename, "file_path": file_path}

    @staticmethod
    def delete_file(file_id):
        stmt = prepare("SELECT * FROM files WHERE id = :id AND is_active = 1")
        file = stmt({"id": file_id}).fetchone()
        if file:
            try:
                os.remove(file['file_path'])
            except Exception as e:
                print(f"Error deleting file: {e}")
            update_stmt = prepare("UPDATE files SET is_active = 0 WHERE id = :id")
            update_stmt({"id": file_id})

    @staticmethod
    def _sanitize_segment(value):
        s = str(value or "")
        s = s.lower()
        out = []
        for ch in s:
            if ch.isalnum() or ch in ['-', '_']:
                out.append(ch)
        return ''.join(out) or 'default'

    @staticmethod
    def ensure_user_experiment_dirs(user_id, experiment_type, sub_experiment, dt):
        base_dir = os.path.join(os.path.dirname(__file__), '../../uploads/users', user_id, 'experiments')
        et = FileService._sanitize_segment(experiment_type)
        se = FileService._sanitize_segment(sub_experiment)
        date_dir = dt.strftime('%Y-%m-%d')
        full_dir = os.path.join(base_dir, et, se, date_dir)
        os.makedirs(full_dir, exist_ok=True)
        return full_dir

    @staticmethod
    def save_experiment_csv(user_id, data, metadata):
        ts_str = metadata.get('timestamp') or datetime.utcnow().isoformat()
        try:
            dt = datetime.fromisoformat(ts_str.replace('Z', '+00:00'))
        except Exception:
            dt = datetime.utcnow()
        exp_type = metadata.get('experiment_type') or metadata.get('sensorType') or 'experiment'
        if exp_type.upper() == 'OSI':
            exp_type = 'oscillation'
        sub_exp = metadata.get('sub_experiment') or metadata.get('graph_type') or 'default'
        run_id = metadata.get('run_id') or str(uuid.uuid4())[:8]
        dir_path = FileService.ensure_user_experiment_dirs(user_id, exp_type, sub_exp, dt)
        ts_compact = dt.strftime('%Y%m%dT%H%M%SZ')
        filename = f"{FileService._sanitize_segment(exp_type)}__{FileService._sanitize_segment(sub_exp)}__{ts_compact}__{run_id}.csv"
        file_path = os.path.join(dir_path, filename)
        headers = metadata.get('headers')
        rows = []
        if isinstance(data, list) and data:
            keys = headers if headers else [k for k in data[0].keys() if k != '__originalIndex']
            rows.append(','.join(keys))
            for row in data:
                vals = []
                for k in keys:
                    v = row.get(k)
                    if v is None:
                        vals.append('')
                    else:
                        s = str(v)
                        if ',' in s or '"' in s or '\n' in s:
                            s = '"' + s.replace('"', '""') + '"'
                        vals.append(s)
                rows.append(','.join(vals))
        else:
            rows.append('value')
        tmp_path = file_path + '.tmp'
        with open(tmp_path, 'w', encoding='utf-8', newline='') as f:
            f.write('\n'.join(rows))
        os.replace(tmp_path, file_path)
        size = os.path.getsize(file_path)
        file_id = str(uuid.uuid4())
        insert_stmt = prepare("""
            INSERT INTO files (id, user_id, file_type, original_name, filename, file_path, mimetype, size)
            VALUES (:id, :user_id, :file_type, :original_name, :filename, :file_path, :mimetype, :size)
        """)
        insert_stmt({
            "id": file_id,
            "user_id": user_id,
            "file_type": 'experiment_csv',
            "original_name": filename,
            "filename": filename,
            "file_path": file_path,
            "mimetype": 'text/csv',
            "size": size
        })
        meta = {
            "experiment_type": exp_type,
            "sub_experiment": sub_exp,
            "run_id": run_id,
            "performed_by": user_id,
            "performed_at": dt.isoformat(),
            "samples": len(data) if isinstance(data, list) else 0,
            "device_id": metadata.get('device_id'),
            "notes": metadata.get('notes')
        }
        meta_path = os.path.join(dir_path, filename.replace('.csv', '.meta.json'))
        with open(meta_path, 'w', encoding='utf-8') as mf:
            json.dump(meta, mf, ensure_ascii=False)
        run_rec_id = str(uuid.uuid4())
        runs_insert = prepare("""
            INSERT INTO experiment_runs (id, user_id, experiment_type, sub_experiment, run_id, performed_at, filename, file_path, size, file_id)
            VALUES (:id, :user_id, :experiment_type, :sub_experiment, :run_id, :performed_at, :filename, :file_path, :size, :file_id)
        """)
        runs_insert({
            "id": run_rec_id,
            "user_id": user_id,
            "experiment_type": exp_type,
            "sub_experiment": sub_exp,
            "run_id": run_id,
            "performed_at": dt.isoformat(),
            "filename": filename,
            "file_path": file_path,
            "size": size,
            "file_id": file_id
        })
        return {"id": file_id, "filename": filename, "file_path": file_path, "run_id": run_rec_id}

    @staticmethod
    def save_uploaded_csv(user_id, file_bytes, original_name, metadata):
        ts_str = metadata.get('timestamp') or datetime.utcnow().isoformat()
        try:
            dt = datetime.fromisoformat(ts_str.replace('Z', '+00:00'))
        except Exception:
            dt = datetime.utcnow()
        exp_type = metadata.get('experiment_type') or 'experiment'
        sub_exp = metadata.get('sub_experiment') or 'default'
        run_id = metadata.get('run_id') or str(uuid.uuid4())[:8]
        dir_path = FileService.ensure_user_experiment_dirs(user_id, exp_type, sub_exp, dt)
        ts_compact = dt.strftime('%Y%m%dT%H%M%SZ')
        base = f"{FileService._sanitize_segment(exp_type)}__{FileService._sanitize_segment(sub_exp)}__{ts_compact}__{run_id}"
        filename = base + '.csv'
        file_path = os.path.join(dir_path, filename)
        tmp_path = file_path + '.tmp'
        with open(tmp_path, 'wb') as f:
            f.write(file_bytes)
        os.replace(tmp_path, file_path)
        size = os.path.getsize(file_path)
        file_id = str(uuid.uuid4())
        insert_stmt = prepare("""
            INSERT INTO files (id, user_id, file_type, original_name, filename, file_path, mimetype, size)
            VALUES (:id, :user_id, :file_type, :original_name, :filename, :file_path, :mimetype, :size)
        """)
        insert_stmt({
            "id": file_id,
            "user_id": user_id,
            "file_type": 'experiment_csv',
            "original_name": original_name or filename,
            "filename": filename,
            "file_path": file_path,
            "mimetype": 'text/csv',
            "size": size
        })
        meta = {
            "experiment_type": exp_type,
            "sub_experiment": sub_exp,
            "run_id": run_id,
            "performed_by": user_id,
            "performed_at": dt.isoformat(),
            "samples": metadata.get('samples'),
            "device_id": metadata.get('device_id'),
            "notes": metadata.get('notes')
        }
        meta_path = os.path.join(dir_path, base + '.meta.json')
        with open(meta_path, 'w', encoding='utf-8') as mf:
            json.dump(meta, mf, ensure_ascii=False)
        run_rec_id = str(uuid.uuid4())
        runs_insert = prepare("""
            INSERT INTO experiment_runs (id, user_id, experiment_type, sub_experiment, run_id, performed_at, filename, file_path, size, file_id)
            VALUES (:id, :user_id, :experiment_type, :sub_experiment, :run_id, :performed_at, :filename, :file_path, :size, :file_id)
        """)
        runs_insert({
            "id": run_rec_id,
            "user_id": user_id,
            "experiment_type": exp_type,
            "sub_experiment": sub_exp,
            "run_id": run_id,
            "performed_at": dt.isoformat(),
            "filename": filename,
            "file_path": file_path,
            "size": size,
            "file_id": file_id
        })
        return {"id": file_id, "filename": filename, "file_path": file_path, "run_id": run_rec_id}