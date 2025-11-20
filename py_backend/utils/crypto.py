import os
import hashlib
import secrets
from typing import Tuple
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.hazmat.primitives import padding
from cryptography.hazmat.backends import default_backend

def derive_key(secret: bytes, mac_bytes: bytes) -> bytes:
    h = hashlib.sha256()
    h.update(secret)
    h.update(mac_bytes)
    return h.digest()[:16]

def _pkcs7_pad(data: bytes) -> bytes:
    padder = padding.PKCS7(128).padder()
    return padder.update(data) + padder.finalize()

def _pkcs7_unpad(data: bytes) -> bytes:
    unpadder = padding.PKCS7(128).unpadder()
    return unpadder.update(data) + unpadder.finalize()

def encrypt_aes_cbc(key: bytes, plaintext: bytes) -> bytes:
    iv = secrets.token_bytes(16)
    cipher = Cipher(algorithms.AES(key), modes.CBC(iv), backend=default_backend())
    encryptor = cipher.encryptor()
    ct = encryptor.update(_pkcs7_pad(plaintext)) + encryptor.finalize()
    return iv + ct

def decrypt_aes_cbc(key: bytes, iv_plus_ct: bytes) -> bytes:
    iv = iv_plus_ct[:16]
    ct = iv_plus_ct[16:]
    cipher = Cipher(algorithms.AES(key), modes.CBC(iv), backend=default_backend())
    decryptor = cipher.decryptor()
    pt_padded = decryptor.update(ct) + decryptor.finalize()
    return _pkcs7_unpad(pt_padded)

def mac_str_to_bytes(address: str) -> bytes:
    s = address.replace(':', '').replace('-', '').strip()
    return bytes.fromhex(s)