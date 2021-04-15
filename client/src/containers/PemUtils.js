import React from 'react'
import {Row, Col, Button} from 'react-bootstrap'
import QRCode from 'qrcode.react'

export class RenderPEM extends React.Component {

  state = {
    afficherPEM: false,
  }

  toggleAfficherPEM = event => {
    this.setState({afficherPEM: !this.state.afficherPEM});
  }

  render() {
    const tailleMaxQR = 800;
    const qrCodes = [];

    var afficherPEM = null;
    if(this.state.afficherPEM) {
      afficherPEM = (
        <Row>
          <Col>
            <pre>
              {this.props.pem}
            </pre>
          </Col>
        </Row>
      )

      if(this.props.pem) {
        var lignesPEM = this.props.pem.trim().split('\n')
        if(lignesPEM[0].startsWith('---')) {
          lignesPEM = lignesPEM.slice(1)
        }
        const derniereLigne = lignesPEM.length - 1
        if(lignesPEM[derniereLigne].startsWith('---')) {
          lignesPEM = lignesPEM.slice(0, derniereLigne)
        }
        const pemFiltre = lignesPEM.join('')

        const nbCodes = Math.ceil(pemFiltre.length / tailleMaxQR);
        const tailleMaxAjustee = pemFiltre.length / nbCodes + nbCodes

        for(let idx=0; idx < nbCodes; idx++) {
          var debut = idx * tailleMaxAjustee, fin = (idx+1) * tailleMaxAjustee;
          if(fin > pemFiltre.length) fin = pemFiltre.length;
          var pemData = pemFiltre.slice(debut, fin);
          // Ajouter premiere ligne d'info pour re-assemblage
          pemData = this.props.nom + ';' + (idx+1) + ';' + nbCodes + '\n' + pemData;
          qrCodes.push(
            <Col xs={12} key={idx} className='qr-code'>
              <QRCode className="qrcode" value={pemData} size={400} />
            </Col>
          );
        }
      }

    }

    return(
      <div>
        <Row>
          {qrCodes}
        </Row>
        {afficherPEM}
        <Row>
          <Col>
            <Button className="bouton" variant="secondary" onClick={this.toggleAfficherPEM}>PEM</Button>
          </Col>
        </Row>
      </div>
    );
  }

}


export class RenderCSR extends React.Component {

  state = {
    csrStringBuffer: '',
  }

  componentDidMount() {
    this.preparerCsr()
  }

  copier = event => {
    if(navigator.clipboard) {
      navigator.clipboard.writeText(this.props.csr)
      console.debug("CSR copie dans le clipboard")
    }
  }

  async preparerCsr() {
    // Convertir le PEM en bytes pour mettre dans un code QR
    const regEx = /\n?-{5}[A-Z ]+-{5}\n?/g
    const pemBase64 = this.props.csr.replaceAll(regEx, '')
    const csrAb = new Uint8Array(Buffer.from(pemBase64, 'base64'))
    const csrStringBuffer = String.fromCharCode.apply(null, csrAb)
    this.setState({csrStringBuffer}, _=>{
      console.debug("RenderCSR state : %O", this.state)
    })
  }

  render() {
    if(!this.state.csrStringBuffer) return <p>Loading</p>

    return (
      <>
        <QRCode className="qrcode"
                value={this.state.csrStringBuffer}
                size={300} />
        <br/>
        <Button onClick={this.copier}>Copier</Button>
      </>
    )
  }

}
