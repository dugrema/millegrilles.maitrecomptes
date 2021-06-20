import React from 'react'
import QrReader from 'react-qr-reader'

export default function QrCodeScanner(props) {
  if(!props.actif) return ''

  return (
    <QrReader
      delay={300}
      onError={props.handleError}
      onScan={props.handleScan}
      style={{ width: '75%', 'text-align': 'center' }}
      />
  )
}
