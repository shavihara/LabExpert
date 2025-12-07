import psutil
import re
import uuid
import logging
import ipaddress
logger = logging.getLogger(__name__)

def get_host_mac() -> str:
    """
    Get the host MAC address using a robust selection strategy.
    Prioritizes physical interfaces (WiFi, Ethernet) over virtual ones (VPN, Loopback).
    Falls back to uuid.getnode() if no suitable interface is found.
    """
    host_mac = None
    try:
        mac_regex = re.compile(r"^[0-9A-F]{2}(:[0-9A-F]{2}){5}$", re.IGNORECASE)
        # Keywords to ignore in interface names
        ignored_keywords = ['loopback', 'tap', 'tun', 'vmware', 'virtual', 'docker', 'vbox', 'pseudo']
        
        stats = psutil.net_if_stats()
        candidates = []
        
        for name, addrs in psutil.net_if_addrs().items():
            lower_name = name.lower()
            # Skip virtual/VPN adapters
            if any(k in lower_name for k in ignored_keywords):
                continue
            
            is_up = False
            if name in stats and getattr(stats[name], 'isup', False):
                is_up = True
                
            for a in addrs:
                addr = getattr(a, 'address', '') or ''
                amac = addr.replace('-', ':').upper()
                if mac_regex.match(amac) and amac != '00:00:00:00:00:00':
                    score = 0
                    # Prioritize WiFi, then Ethernet
                    if 'wi-fi' in lower_name or 'wlan' in lower_name or 'wireless' in lower_name:
                        score = 2
                    elif 'ethernet' in lower_name or 'eth' in lower_name or 'en' in lower_name:
                        score = 1
                    
                    # High priority for active (UP) interfaces
                    if is_up:
                        score += 10
                        
                    candidates.append((score, amac, name))
                    break
                    
        if candidates:
            # Sort by score descending
            candidates.sort(key=lambda x: x[0], reverse=True)
            host_mac = candidates[0][1]
            logger.info(f"Selected Host MAC: {host_mac} from interface '{candidates[0][2]}' (Score: {candidates[0][0]})")
            return host_mac

    except Exception as e:
        logger.error(f"Error determining MAC: {e}")
    
    # Fallback to uuid.getnode() if everything else fails
    if not host_mac:
        logger.warning("Falling back to uuid.getnode() for MAC address")
        node = uuid.getnode()
        mac_hex = f"{node:012x}".upper()
        host_mac = ":".join(mac_hex[i:i+2] for i in range(0, 12, 2))
        
    return host_mac

def get_host_ip() -> str:
    """
    Get the host IP address using a robust selection strategy.
    Prioritizes physical interfaces (WiFi, Ethernet) over virtual ones.
    Returns 127.0.0.1 if no suitable IP is found.
    """
    host_ip = "127.0.0.1"
    try:
        # Keywords to ignore in interface names
        ignored_keywords = ['loopback', 'tap', 'tun', 'vmware', 'virtual', 'docker', 'vbox', 'pseudo']
        
        stats = psutil.net_if_stats()
        candidates = []
        
        for name, addrs in psutil.net_if_addrs().items():
            lower_name = name.lower()
            # Skip virtual/VPN adapters
            if any(k in lower_name for k in ignored_keywords):
                continue
            
            is_up = False
            if name in stats and getattr(stats[name], 'isup', False):
                is_up = True
                
            for a in addrs:
                # Check for IPv4 (family=2)
                if getattr(a, 'family', 0) == 2:
                    addr = getattr(a, 'address', '') or ''
                    if addr and not addr.startswith('127.') and not addr.startswith('169.254.'):
                        score = 0
                        # Prioritize WiFi, then Ethernet
                        if 'wi-fi' in lower_name or 'wlan' in lower_name or 'wireless' in lower_name:
                            score = 2
                        elif 'ethernet' in lower_name or 'eth' in lower_name or 'en' in lower_name:
                            score = 1
                        
                        # High priority for active (UP) interfaces
                        if is_up:
                            score += 10
                            
                        # Prefer standard private ranges
                        if addr.startswith('192.168.'):
                            score += 2
                        elif addr.startswith('10.') or addr.startswith('172.'):
                            score += 1
                            
                        candidates.append((score, addr, name))
                        
        if candidates:
            # Sort by score descending
            candidates.sort(key=lambda x: x[0], reverse=True)
            host_ip = candidates[0][1]
            logger.info(f"Selected Host IP: {host_ip} from interface '{candidates[0][2]}' (Score: {candidates[0][0]})")
            
    except Exception as e:
        logger.error(f"Error determining IP: {e}")
        
    return host_ip
def select_local_ip_for_peer(peer_ip: str) -> str:
    host_ip = None
    try:
        ip_peer = ipaddress.ip_address(peer_ip) if peer_ip else None
        ignored_keywords = ['loopback', 'tap', 'tun', 'vmware', 'virtual', 'docker', 'vbox', 'pseudo']
        stats = psutil.net_if_stats()
        candidates = []
        for name, addrs in psutil.net_if_addrs().items():
            lower_name = name.lower()
            if any(k in lower_name for k in ignored_keywords):
                continue
            is_up = name in stats and getattr(stats[name], 'isup', False)
            for a in addrs:
                if getattr(a, 'family', 0) == 2:
                    ip = getattr(a, 'address', '') or ''
                    netmask = getattr(a, 'netmask', '') or ''
                    if ip and netmask and ip_peer is not None:
                        try:
                            network = ipaddress.ip_network(f"{ip}/{netmask}", strict=False)
                            if ip_peer in network:
                                score = 0
                                if 'wi-fi' in lower_name or 'wlan' in lower_name or 'wireless' in lower_name:
                                    score = 2
                                elif 'ethernet' in lower_name or 'eth' in lower_name or 'en' in lower_name:
                                    score = 1
                                if is_up:
                                    score += 10
                                candidates.append((score, ip, name))
                        except Exception:
                            pass
        if candidates:
            candidates.sort(key=lambda x: x[0], reverse=True)
            host_ip = candidates[0][1]
    except Exception:
        host_ip = None
    return host_ip or get_host_ip()

def get_candidate_local_ips() -> list:
    ips = set()
    try:
        ignored_keywords = ['loopback', 'tap', 'tun', 'vmware', 'virtual', 'docker', 'vbox', 'pseudo']
        stats = psutil.net_if_stats()
        for name, addrs in psutil.net_if_addrs().items():
            lower_name = name.lower()
            if any(k in lower_name for k in ignored_keywords):
                continue
            is_up = name in stats and getattr(stats[name], 'isup', False)
            if not is_up:
                continue
            for a in addrs:
                if getattr(a, 'family', 0) == 2:
                    ip = getattr(a, 'address', '') or ''
                    if ip and not ip.startswith('127.') and not ip.startswith('169.254.'):
                        ips.add(ip)
    except Exception:
        pass
    ips.add(get_host_ip())
    return list(ips)