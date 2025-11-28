import { useEffect, useState } from 'react'
import { useWebSocket } from '../hooks/useWebSocket'

export default function SensorProvisioning({ token }) {
  const ws = useWebSocket(token, true)
  const [devices, setDevices] = useState([])
  const [selected, setSelected] = useState(null)
  const [ssid, setSsid] = useState('')
  const [passw, setPassw] = useState('')
  const [status, setStatus] = useState('')
  const [enabled, setEnabled] = useState(true)

  useEffect(() => {
    const unsub = ws.addMessageHandler((msg) => {
      if (msg.type === 'ble_scan_result') {
        setDevices(msg.devices || [])
        setEnabled(!!msg.enabled)
      } else if (msg.type === 'ble_selected') {
        setStatus('device_selected')
      } else if (msg.type === 'ble_status') {
        setStatus(msg.status)
      } else if (msg.type === 'ble_result') {
        setStatus(msg.message)
      }
    })
    return unsub
  }, [ws])

  const scan = () => {
    ws.sendMessage({ action: 'ble_scan' })
  }
  const select = (address) => {
    setSelected(address)
    ws.sendMessage({ action: 'ble_select', address })
  }
  const provision = () => {
    if (!ssid || !passw || !selected) return
    ws.sendMessage({ action: 'ble_provision', ssid, pass: passw })
  }

  return (
    <div style={{ padding: 16 }}>
      <h2>Sensor Provisioning</h2>
      <button onClick={scan}>Scan</button>
      {!enabled && <div>Bluetooth disabled. Enable Bluetooth in Windows settings.</div>}
      <div>
        {devices.map((d) => (
          <div key={d.address} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span>{d.name}</span>
            <span>{d.address}</span>
            <button onClick={() => select(d.address)}>Select</button>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 16 }}>
        <input placeholder="SSID" value={ssid} onChange={(e)=>setSsid(e.target.value)} />
        <input placeholder="Password" type="password" value={passw} onChange={(e)=>setPassw(e.target.value)} />
        <button onClick={provision}>Provision</button>
      </div>
      <div style={{ marginTop: 16 }}>Status: {status}</div>
    </div>
  )
}