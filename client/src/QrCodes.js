import { useEffect, useMemo, useRef, useCallback } from 'react'
import qrcode from 'qrcode-generator'

// import QRCode from 'qrcode.react'

// export function RenderCsr(props) {

//     const { value } = props

//     const size = props.size || 300,
//           className = props.className || 'qr-code-background'

//     const [csrStringBuffer, setCsrStringBuffer] = useState('')
  
//     useEffect(_=>{
//         if(value) {
//             const csrStringBuffer = preparerCsr(value)
//             setCsrStringBuffer(csrStringBuffer)
//         }
//     }, [value])
  
//     if(!csrStringBuffer) return <p>Chargement en cours</p>
  
//     return (
//         <QRCode 
//             className={className}
//             value={csrStringBuffer}
//             size={size} />
//     )
  
// }

// function preparerCsr(csrPem) {
//     // Convertir le PEM en bytes pour mettre dans un code QR
//     const regEx = /\n?-{5}[A-Z ]+-{5}\n?/g
//     const pemBase64 = csrPem.replaceAll(regEx, '')
  
//     const csrAb = new Uint8Array(Buffer.from(pemBase64, 'base64'))
//     const csrStringBuffer = String.fromCharCode.apply(null, csrAb)
  
//     return csrStringBuffer
// }
  
export function RenderActivationCode(props) {
    const { value } = props
    const className = props.className || ''

    const svgTagElem = useRef()

    useEffect(()=>{
        let typeNumber = 4
        let errorCorrectionLevel = 'L';
        let qr = qrcode(typeNumber, errorCorrectionLevel)
        qr.addData(value)
        qr.make()
        const tag = qr.createSvgTag({scalable: true})
        svgTagElem.current.innerHTML = tag
    }, [value, svgTagElem])

    return (
        <div className={className} ref={svgTagElem} />
    )
}
