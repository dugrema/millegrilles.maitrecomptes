import React from 'react'
import {Container, Row, Col, Button} from 'react-bootstrap'
import {
    genererCertificatMilleGrille, genererCertificatIntermediaire, genererCertificatFin,
  } from 'millegrilles.common/lib/cryptoForge'
import {
    enveloppePEMPublique, enveloppePEMPrivee, chiffrerPrivateKeyPEM,
    CertificateStore, matchCertificatKey, signerContenuString, chargerClePrivee,
  } from 'millegrilles.common/lib/forgecommon'
import { CryptageAsymetrique } from 'millegrilles.common/lib/cryptoSubtle'
import axios from 'axios'
import { RenderPEM } from './PemUtils'
import { v4 as uuidv4 } from 'uuid'

import stringify from 'json-stable-stringify'

const cryptageAsymetriqueHelper = new CryptageAsymetrique()

export default class Pki extends React.Component {

  state = {
    idmgUsager: null,

    racinePrivatePem: null,
    racinePrivateChiffree: null,
    racineCertPem: null,
    racineCert: null,

    backupRacine: false,

    chaineCertificats: null,
    cleIntermediaire: null,
    cleFin: null,

    caStore: null,

  }

  componentDidMount() {
    const infoLocal = chargerDeLocal()
    if(infoLocal.chaineCertificats && infoLocal.cleFin) {
      // Valider la chaine en memoire
      const certMillegrille = infoLocal.chaineCertificats[2]
      // console.debug("Cert millegrille")
      // console.debug(certMillegrille)
      const caStore = new CertificateStore(certMillegrille)

      const valide = caStore.verifierChaine(infoLocal.chaineCertificats)
      if(valide) {

        const cleCertMatch = matchCertificatKey(infoLocal.chaineCertificats[0], infoLocal.cleFin)

        if(cleCertMatch) {
          const updateInfo = {...infoLocal, backupRacine: true}
          this.setState(updateInfo)
        } else {
          console.warn("Cle / certificats de match pas")
        }
      } else {
        console.warn("Chaine de certificat invalide")
      }
    } else {
      // L'information n'est pas utilisable
    }

  }

  genererCertificatMilleGrille = async event => {
    const racine = await genererNouveauCertificatMilleGrille()
    // console.debug("Certificats et cles Racine")
    // console.debug(racine)

    const idmgUsager = racine.idmgUsager
    // console.debug("IDMG : %s", idmgUsager)

    this.setState({
      idmgUsager,
      racinePrivatePem: racine.clePriveePEM,
      racinePrivateChiffree: racine.clePriveeChiffree,
      racineCertPem: racine.certPEM,
      racineCert: racine.cert,
    }, ()=>{console.debug(this.state)})
  }

  genererCertsViaRacine = async event => {
    const idmgUsager = this.state.idmgUsager

    // console.debug("State genererCertsViaRacine")
    const intermediaire = await genererNouveauIntermediaire(idmgUsager, this.state.racineCert, this.state.racinePrivatePem)
    // console.debug("Certificats et cles Intermediaire")
    // console.debug(intermediaire)

    const fin = await genererNouveauFin(idmgUsager, intermediaire.cert, intermediaire.clePriveePEM)
    // console.debug("Certificats et cles Fin")
    // console.debug(fin)

    const chaineCertificats = [
      fin.certPEM,
      intermediaire.certPEM,
      this.state.racineCertPem,
    ]

    this.setState({
      chaineCertificats,
      backupRacine: true,
      cleIntermediaire: intermediaire.clePriveePEM,
      cleFin: fin.clePriveePEM,

      racinePrivatePem: null, // Eliminer la cle privee de la MilleGrille
    }, ()=>{conserverVersLocal({...this.state})})
  }

  render() {

    var contenu = null

    if(!this.state.idmgUsager) {
      contenu = (
        <Row>
          <Col>
            <Button onClick={this.genererCertificatMilleGrille}>Nouveau</Button>
            <Button onClick={this.props.annuler} variant="secondary">Annuler</Button>
          </Col>
        </Row>
      )
    }
    else if(!this.state.backupRacine) {
      contenu =
        <AffichageBackup
          idmg={this.state.idmgUsager}
          racinePrivateChiffree={this.state.racinePrivateChiffree}
          racineCertPem={this.state.racineCertPem}
          genererCertsViaRacine={this.genererCertsViaRacine}
          annuler={this.props.annuler} />
    } else {
      contenu = <LoginPki {...this.state} annuler={this.props.annuler} />
    }

    return (
      <Container>
        <h1>Pki</h1>

        {contenu}

      </Container>
    )
  }

}

class AffichageBackup extends React.Component {

  state = {
    backupDataUrl: null,
  }

  componentDidMount() {
    const elems = ['idmgUsager', 'racinePrivateChiffree', 'racineCertPem']
    const jsonInfo = {}
    for(let idx in elems) {
      const elem = elems[idx]
      jsonInfo[elem] = this.props[elem]
    }
    const backupDataUrl = genererUrlDataDownload(jsonInfo)

    this.setState({backupDataUrl})
  }

  render() {
    return (
      <div>
        <Row>
          <Col>
            IDMG du certificat : {this.state.idmgUsager}
          </Col>
        </Row>

        <Row>
          <Col>
            <Button href={this.state.backupDataUrl} download={'backup_idmg_'+ this.props.idmgUsager +'.json'}>Telecharger backup</Button>
          </Col>
        </Row>

        <RenderPEM nom="cleRacineChiffree" pem={this.props.racinePrivateChiffree}/>

        <RenderPEM nom="certRacine" pem={this.props.racineCertPem}/>

        <Row>
          <Col>
            <Button onClick={this.props.genererCertsViaRacine}>Suivant</Button>
            <Button onClick={this.props.annuler} variant="secondary">Annuler</Button>
          </Col>
        </Row>
      </div>
    )
  }

}

class LoginPki extends React.Component {

  state = {
    challenge: uuidv4()
  }


  login = async event => {
    console.debug("Login challenge cert")

    // Signer une demande d'authentification
    const message = {
      chaineCertificats: this.props.chaineCertificats,
      dateCourante: new Date().getTime(),
      challenge: this.state.challenge,
    }
    const chaineCertsStableJson = stringify(message)

    // Signer la chaine de certificats
    console.debug("Cle fin : %s", this.props.cleFin)
    const clePriveePki = chargerClePrivee(this.props.cleFin)
    const signature = signerContenuString(clePriveePki, chaineCertsStableJson)
    console.debug("Signature")
    console.debug(signature)

    const resultat = await axios({
      method: 'post',
      url: '/millegrilles/authentification/challengeChaineCertificats',
      data: {...message, '_signature': signature},
    })

    console.debug("Resultats challenge cert")
    console.debug(resultat)
  }

  render() {
    return (
      <div>
        <p>IDMG : {this.props.idmgUsager}</p>
        <Row>
          <Col>
            <Button onClick={this.login} variant="secondary">Login</Button>
            <Button onClick={this.props.annuler} variant="secondary">Retour</Button>
          </Col>
        </Row>
      </div>
    )
  }
}

// Genere un nouveau certificat de MilleGrille racine
async function genererNouveauCertificatMilleGrille() {
  // Generer nouvelles cle privee, cle publique
  const {clePrivee, clePublique} = await cryptageAsymetriqueHelper.genererKeyPair()
  const clePriveePEM = enveloppePEMPrivee(clePrivee, true),
        clePubliquePEM = enveloppePEMPublique(clePublique)
  const clePriveeChiffree = await chiffrerPrivateKeyPEM(clePriveePEM, 'abcd')

  // console.debug("Cle Privee Chiffree")
  // console.debug(clePriveeChiffree)

  // Importer dans forge, creer certificat de MilleGrille
  const {cert, pem: certPEM, idmg: idmgUsager} = await genererCertificatMilleGrille(clePriveePEM, clePubliquePEM)

  return {
    clePriveePEM, clePubliquePEM, cert, certPEM, idmgUsager, clePriveeChiffree
  }
}

async function genererNouveauIntermediaire(idmgUsager, certificatRacine, clePriveeRacinePEM) {

  // console.debug("Certificat intermediaire")

  const {clePrivee, clePublique} = await cryptageAsymetriqueHelper.genererKeyPair()
  const clePriveePEM = enveloppePEMPrivee(clePrivee),
        clePubliquePEM = enveloppePEMPublique(clePublique)

  // Importer dans forge, creer certificat de MilleGrille
  const {cert, pem: certPEM} = await genererCertificatIntermediaire(idmgUsager, certificatRacine, clePriveeRacinePEM, clePubliquePEM)

  return {
    clePriveePEM, clePubliquePEM, cert, certPEM,
  }

}

async function genererNouveauFin(idmg, certificatIntermediaire, clePriveeIntermediaire) {
  // console.debug("Certificat fin")

  const {clePrivee, clePublique} = await cryptageAsymetriqueHelper.genererKeyPair()
  const clePriveePEM = enveloppePEMPrivee(clePrivee),
        clePubliquePEM = enveloppePEMPublique(clePublique)

  // Importer dans forge, creer certificat de MilleGrille
  const {cert, pem: certPEM} = await genererCertificatFin(idmg, certificatIntermediaire, clePriveeIntermediaire, clePubliquePEM)

  return {
    clePriveePEM, clePubliquePEM, cert, certPEM,
  }
}

function conserverVersLocal(info) {
  if(info.chaineCertificats) {
    localStorage.setItem('chaineCertificats', JSON.stringify(info.chaineCertificats))
  }
  if(info.cleIntermediaire) {
    localStorage.setItem('cleIntermediaire', JSON.stringify(info.cleIntermediaire))
  }
  if(info.cleFin) {
    localStorage.setItem('cleFin', JSON.stringify(info.cleFin))
  }
  if(info.idmg) {
    localStorage.setItem('idmgUsager', JSON.stringify(info.idmgUsager))
  }
}

function chargerDeLocal() {
  const info = {
    chaineCertificats: localStorage.getItem('chaineCertificats'),
    cleIntermediaire: localStorage.getItem('cleIntermediaire'),
    cleFin: localStorage.getItem('cleFin'),
    idmgUsager: localStorage.getItem('idmgUsager'),
  }

  const infoObj = {}
  for(let cle in info) {
    if(info[cle]) {
      infoObj[cle] = JSON.parse(info[cle])
    }
  }

  return infoObj
}

function genererUrlDataDownload(jsonContent) {
  const stringContent = JSON.stringify(jsonContent)
  const blobFichier = new Blob([stringContent], {type: 'application/json'})
  let dataUrl = window.URL.createObjectURL(blobFichier)
  return dataUrl
}
