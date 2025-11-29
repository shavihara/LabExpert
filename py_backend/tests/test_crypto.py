import os
from utils.crypto import derive_key, encrypt_aes_cbc, decrypt_aes_cbc, mac_str_to_bytes

def test_roundtrip():
    secret = b"DEV_SECRET"
    mac = mac_str_to_bytes("AA:BB:CC:DD:EE:FF")
    key = derive_key(secret, mac)
    data = b"ssid:MyWiFi|pass:SuperSecret123"
    enc = encrypt_aes_cbc(key, data)
    dec = decrypt_aes_cbc(key, enc)
    assert dec == data