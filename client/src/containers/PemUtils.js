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
    const tailleMaxQR = 850;
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
        const nbCodes = Math.ceil(this.props.pem.length / tailleMaxQR);
        const tailleMaxAjustee = this.props.pem.length / nbCodes + nbCodes

        var lignesPEM = this.props.pem.split('\n')
        if(lignesPEM[0].startsWith('-----')) {
          lignesPEM = lignesPEM.slice(1)
        }
        const derniereLigne = lignesPEM.length - 1
        if(lignesPEM[derniereLigne].startsWith('-----')) {
          lignesPEM = lignesPEM.slice(0, derniereLigne-1)
        }
        const pemFiltre = lignesPEM.join('\n')

        for(let idx=0; idx < nbCodes; idx++) {
          var debut = idx * tailleMaxAjustee, fin = (idx+1) * tailleMaxAjustee;
          if(fin > this.props.pem.length) fin = this.props.pem.length;
          var pemData = this.props.pem.slice(debut, fin);
          // Ajouter premiere ligne d'info pour re-assemblage
          pemData = this.props.nom + ';' + idx + '\n' + pemData;
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
