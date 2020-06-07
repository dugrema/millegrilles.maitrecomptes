import React from 'react'
import {Container, Row, Col, Button} from 'react-bootstrap'
import {
    genererCertificatMilleGrille, genererCertificatIntermediaire, genererCertificatFin,
    enveloppePEMPublique, enveloppePEMPrivee
  } from 'millegrilles.common/lib/cryptoForge'
import { CryptageAsymetrique } from 'millegrilles.common/lib/cryptoSubtle'

import { RenderPEM } from './PemUtils'

const cryptageAsymetriqueHelper = new CryptageAsymetrique()

export default class Pki extends React.Component {

  state = {
    idmg: null,
    racinePrivatePem: null,
  }

  genererCertificatMilleGrille = async event => {
    const racine = await genererNouveauCertificatMilleGrille()
    console.debug("Certificats et cles Racine")
    console.debug(racine)

    console.debug("IDMG calcule : %s", racine.idmg)

    const idmg = racine.idmg
    console.debug("IDMG : %s", idmg)

    const intermediaire = await genererNouveauIntermediaire(idmg, racine.cert, racine.clePriveePEM)
    console.debug("Certificats et cles Intermediaire")
    console.debug(intermediaire)

    const fin = await genererNouveauFin(idmg, intermediaire.cert, intermediaire.clePriveePEM)
    console.debug("Certificats et cles Fin")
    console.debug(fin)

    this.setState({idmg, racinePrivatePem: racine.clePriveePEM})
  }

  render() {

    var afficherIdmg = null
    if(this.state.idmg) {
      afficherIdmg = (
        <div>
          <Row>
            <Col>
              IDMG du certificat : {this.state.idmg}
            </Col>
          </Row>

          <RenderPEM nom="cleRacine" pem={this.state.racinePrivatePem}/>
        </div>
      )
    }

    return (
      <Container>
        <h1>Pki</h1>

        <Row>
          <Col>
            <Button onClick={this.genererCertificatMilleGrille}>Nouveau</Button>
            <Button onClick={this.props.annuler} variant="secondary">Annuler</Button>
          </Col>
        </Row>

        {afficherIdmg}

      </Container>
    )
  }

}

// Genere un nouveau certificat de MilleGrille racine
async function genererNouveauCertificatMilleGrille() {
  // Generer nouvelles cle privee, cle publique
  const {clePrivee, clePublique} = await cryptageAsymetriqueHelper.genererKeyPair()
  const clePriveePEM = enveloppePEMPrivee(clePrivee),
        clePubliquePEM = enveloppePEMPublique(clePublique)

  // Importer dans forge, creer certificat de MilleGrille
  const {cert, pem: certPEM, idmg} = await genererCertificatMilleGrille(clePriveePEM, clePubliquePEM)

  return {
    clePriveePEM, clePubliquePEM, cert, certPEM, idmg,
  }
}

async function genererNouveauIntermediaire(idmg, certificatRacine, clePriveeRacinePEM) {

  console.debug("Certificat intermediaire")

  const {clePrivee, clePublique} = await cryptageAsymetriqueHelper.genererKeyPair()
  const clePriveePEM = enveloppePEMPrivee(clePrivee),
        clePubliquePEM = enveloppePEMPublique(clePublique)

  // Importer dans forge, creer certificat de MilleGrille
  const {cert, pem: certPEM} = await genererCertificatIntermediaire(idmg, certificatRacine, clePriveeRacinePEM, clePubliquePEM)

  return {
    clePriveePEM, clePubliquePEM, cert, certPEM,
  }

}

async function genererNouveauFin(idmg, certificatIntermediaire, clePriveeIntermediaire) {
  console.debug("Certificat fin")

  const {clePrivee, clePublique} = await cryptageAsymetriqueHelper.genererKeyPair()
  const clePriveePEM = enveloppePEMPrivee(clePrivee),
        clePubliquePEM = enveloppePEMPublique(clePublique)

  // Importer dans forge, creer certificat de MilleGrille
  const {cert, pem: certPEM} = await genererCertificatFin(idmg, certificatIntermediaire, clePriveeIntermediaire, clePubliquePEM)

  return {
    clePriveePEM, clePubliquePEM, cert, certPEM,
  }
}
