import {useState, useEffect} from 'react'
import QRCode from 'qrcode.react'

export function RenderCsr(props) {

    const { value } = props

    const size = props.size || 300,
          className = props.className

    const [csrStringBuffer, setCsrStringBuffer] = useState('')
  
    useEffect(_=>{
        if(value) {
            const csrStringBuffer = preparerCsr(value)
            setCsrStringBuffer(csrStringBuffer)
        }
    }, [value])
  
    if(!csrStringBuffer) return <p>Chargement en cours</p>
  
    return (
        <QRCode 
            className={className}
            value={csrStringBuffer}
            size={size} />
    )
  
}

  function preparerCsr(csrPem) {
    // Convertir le PEM en bytes pour mettre dans un code QR
    const regEx = /\n?-{5}[A-Z ]+-{5}\n?/g
    const pemBase64 = csrPem.replaceAll(regEx, '')
  
    const csrAb = new Uint8Array(Buffer.from(pemBase64, 'base64'))
    const csrStringBuffer = String.fromCharCode.apply(null, csrAb)
  
    return csrStringBuffer
  }
  