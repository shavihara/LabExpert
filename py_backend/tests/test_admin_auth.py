from fastapi.testclient import TestClient
from py_backend.main import app

client = TestClient(app)

def test_admin_login_requires_change_password():
    r = client.post('/api/admin/auth/login', json={'email': 'labexpert.us@gmail.com', 'password': 'admin123'})
    assert r.status_code == 200
    data = r.json()
    assert data['success'] is True
    assert data['must_change_password'] is True
    # cookies set
    assert 'admin_access_token' in r.cookies
    assert 'admin_csrf_token' in r.cookies

def test_change_password_and_login():
    # login first to get cookies
    r = client.post('/api/admin/auth/login', json={'email': 'labexpert.us@gmail.com', 'password': 'admin123'})
    csrf = r.cookies.get('admin_csrf_token')
    # change password
    r2 = client.post('/api/admin/auth/change-password', json={'current_password': 'admin123', 'new_password': 'Admin1234'}, headers={'X-CSRF-Token': csrf})
    assert r2.status_code == 200
    # old token deleted, login with new password
    r3 = client.post('/api/admin/auth/login', json={'email': 'labexpert.us@gmail.com', 'password': 'Admin1234'})
    assert r3.status_code == 200
    # me endpoint
    r4 = client.get('/api/admin/auth/me', cookies={'admin_access_token': r3.cookies.get('admin_access_token')})
    assert r4.status_code == 200
    assert r4.json()['success'] is True

def test_admin_users_list_requires_superadmin():
    r = client.post('/api/admin/auth/login', json={'email': 'labexpert.us@gmail.com', 'password': 'Admin1234'})
    token = r.cookies.get('admin_access_token')
    r2 = client.get('/api/admin/users', cookies={'admin_access_token': token})
    assert r2.status_code == 200
    assert 'admins' in r2.json()