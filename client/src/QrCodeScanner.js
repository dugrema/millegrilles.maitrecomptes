import React, {useCallback} from 'react'
import { QrReader } from '@blackbox-vision/react-qr-reader'
import {base64} from 'multiformats/bases/base64'

function QrCodeScanner(props) {

  const { erreurCb, setData } = props

  const resultCb = useCallback((result, error) => {
      if (!!result) {
          const data = handleScan(result?.text)
          setData(data)
      }
      if (!!error) {
        erreurCb(error)
      }
  }, [setData, erreurCb])

  if(!props.show) return ''

  return (
    <QrReader
      constraints={{ facingMode: 'environment' }}
      scanDelay={300}
      onResult={resultCb}
      style={{ width: '75%', 'text-align': 'center' }}
    />
  )
}

export default QrCodeScanner

function handleScan(data) {
  const dataB64 = base64.encode(Buffer.from(data, 'binary')).slice(1)
  // const pem = `-----BEGIN CERTIFICATE REQUEST-----\n${formatPem(dataB64)}\n-----END CERTIFICATE REQUEST-----`
  return formatPem(dataB64)
}

const TAILLE_LIGNE = 64

function formatPem(pem) {
  let output = ['-----BEGIN CERTIFICATE REQUEST-----']
  while(pem.length > TAILLE_LIGNE) {
    output.push(pem.slice(0, TAILLE_LIGNE))
    pem = pem.slice(TAILLE_LIGNE)
  }
  output.push(pem)
  output.push('-----END CERTIFICATE REQUEST-----')
  return output.join('\n')
}