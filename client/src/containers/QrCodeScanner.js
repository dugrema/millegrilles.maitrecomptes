import React, {useState, useEffect} from 'react'
// import QRCode from 'qrcode.react'
import { QrReader } from '@blackbox-vision/react-qr-reader';

export default function QrCodeScanner(props) {

  const [err, setErr] = useState('')
  const [data, setData] = useState('')

  if(!props.actif) return ''

  return (
    <>
      <p>Le reader</p>
      <QrReader
        constraints={{ facingMode: 'environment' }}
        scanDelay={300}
        onResult={(result, error) => {
          if (!!result) {
            const pem = handleScan(result?.text)
            // setData(pem);
            props.setPem(pem)
          }
          if (!!error) {
            setErr(error)
          }
        }}
        style={{ width: '75%', 'text-align': 'center' }}
      />
      <p>C'etait le reader</p>

      <p>Erreur</p>
      <pre>{''+err}</pre>

      <p>Data</p>
      <pre>{''+data}</pre>
    </>
  )

  // return (
  //   <QRCode
  //     size={300}
  //     onError={props.handleError}
  //     onScan={props.handleScan}
  //     style={{ width: '75%', 'text-align': 'center' }}
  //     />
  // )
}

function handleScan(data) {
  const dataB64 = btoa(data)
  const pem = `-----BEGIN CERTIFICATE REQUEST-----\n${dataB64}\n-----END CERTIFICATE REQUEST-----`
  return pem
}