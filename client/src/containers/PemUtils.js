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
