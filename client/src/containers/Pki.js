import React from 'react'
import {Container, Row, Col, Button, Form} from 'react-bootstrap'
import {
    genererCertificatMilleGrille, genererCertificatIntermediaire, genererCertificatFin,
  } from 'millegrilles.common/lib/cryptoForge'
import {
    enveloppePEMPublique, enveloppePEMPrivee, chiffrerPrivateKeyPEM,
    CertificateStore, matchCertificatKey, signerContenuString, chargerClePrivee,
    calculerIdmg,
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
    const infoValidation = validerChaineCertificats()
    if(infoValidation.valide) {
      const {infoLocal, certMillegrille, idmgUsager} = infoValidation

      const cleCertMatch = matchCertificatKey(infoLocal.chaineCertificats[0], infoLocal.cleFin)

      if(cleCertMatch) {
        const updateInfo = {...infoLocal, idmgUsager, backupRacine: true}
        this.setState(updateInfo)
      } else {
        console.warn("Cle / certificats de match pas")
      }
    } else {
      // Certificat absent ou invalide
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

    // Associer le IDMG au compte usager
    const messageAssociationIdmg = {
      idmg: idmgUsager,
      chaineCertificats: chaineCertificats.slice(1),
    }
    const commandeUrl = this.props.apiUrl + '/associerIdmg'
    console.debug("Transmission association %s", commandeUrl)
    const reponseAjout = await axios.post(commandeUrl, messageAssociationIdmg)
    console.debug("Reponse ajout :")
    console.debug(reponseAjout)
    if(reponseAjout.status !== 200) {
      throw new Error("Erreur association idmg au compte")
    }

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
            <Button onClick={this.props.revenir} variant="secondary">Annuler</Button>
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
          annuler={this.props.revenir} />
    } else {
      contenu =
        <AfficherInformationCertificat
          {...this.state}
          annuler={this.props.revenir} />
    }

    return (
      <Container>
        <h1>Certificat</h1>

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

export class PkiInscrire extends React.Component {

  render() {
    return (
      <Container>
        <p>Inscrire avec un certificat existant</p>

        <p>
          Veuillez telecharger votre cle et certificat de MilleGrille. Cette cle
          ne sera pas transmise au serveur, elle reste temporairement dans
          votre navigateur tant que l'ecran actuel est ouvert. Elle est ensuite effacee.
        </p>

        <p>
          Une nouvelle chaine de certificat va etre generee et stockee sur
          le serveur et dans votre navigateur.
        </p>

        <p>
         La cle du certificat intermediaire sera chiffree avec le mot de passe
         que vous saisissez puis stockee sur le serveur.
        </p>
      </Container>
    )
  }
}

class AfficherInformationCertificat extends React.Component {

  state = {

  }

  componentDidMount() {
    // Valider le certificat, extraire la date d'expiration du certificat
    // intermediaire
  }

  render() {

    return (
      <Row>
        <Col>
          <p>IDMG : {this.props.idmgUsager}</p>
          <Button onClick={this.supprimer}>Supprimer</Button>
          <Button onClick={this.props.annuler} variant="secondary">Retour</Button>
        </Col>
      </Row>
    )
  }

}

class LoginPki extends React.Component {

  state = {
    challenge: uuidv4(),
    messageString: ''
  }


  login = async event => {
    event.preventDefault()
    event.stopPropagation()
    const form = event.currentTarget

    console.debug("Login challenge cert")

    const resultat = await axios({
      method: 'post',
      url: '/millegrilles/authentification/challengeChaineCertificats',
      data: 'challenge=' + this.state.challenge,
    })

    console.debug("Resultats challenge cert")
    console.debug(resultat)

    if(resultat.challengeRecu === this.state.challenge) {
      throw new Error("Challenge recu different du challenge transmis")
    }

    // Repondre avec certs, challenge et signature
    // Signer une demande d'authentification
    const message = {
      chaineCertificats: this.props.chaineCertificats,
      challengeId: resultat.challengeId,
    }

    // Signer la chaine de certificats
    console.debug("Cle fin : %s", this.props.cleFin)
    const clePriveePki = chargerClePrivee(this.props.cleFin)
    const signature = signerContenuString(clePriveePki, stringify(message))
    console.debug("Signature")
    console.debug(signature)

    message['_signature'] = signature

    this.setState(
      {
        messageString: stringify(message)
      },
      ()=>{form.submit()}
    )

  }

  render() {
    return (
      <div>
        <p>IDMG : {this.props.idmgUsager}</p>
        <Form onSubmit={this.login} method="post" action="/millegrilles/authentification/ouvrir">
          <Form.Control key="certificat-client-json" type="hidden"
            name="certificat-client-json" value={this.state.messageString} />
          <Row>
            <Col>
              <Button type="submit" variant="secondary">Login</Button>
              <Button onClick={this.props.annuler} variant="secondary">Retour</Button>
            </Col>
          </Row>
        </Form>
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
    cleFin: localStorage.getItem('cleFin'),
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

export function validerChaineCertificats() {
  const infoLocal = chargerDeLocal()
  if(infoLocal.chaineCertificats && infoLocal.cleFin) {

    // Valider la chaine en memoire
    const certMillegrille = infoLocal.chaineCertificats[2]
    console.debug("Cert millegrille")
    console.debug(certMillegrille)
    const caStore = new CertificateStore(certMillegrille)
    const idmgUsager = calculerIdmg(certMillegrille)

    const valide = caStore.verifierChaine(infoLocal.chaineCertificats)
    return {valide, infoLocal, certMillegrille, idmgUsager}
  }
  return {valide: false}
}
