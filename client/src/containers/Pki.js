import React from 'react'
import {Container, Row, Col, Button} from 'react-bootstrap'

import { forgecommon } from '@dugrema/millegrilles.reactjs'
import { genererNouveauCertificatMilleGrille } from '../components/pkiHelper'
import { RenderPEM } from './PemUtils'

const {CertificateStore, matchCertificatKey, calculerIdmg} = forgecommon

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
    // NOTE - A Refaire
    // const infoValidation = validerChaineCertificats()
    // if(infoValidation.valide) {
    //   const {infoLocal, idmgUsager} = infoValidation
    //
    //   const cleCertMatch = matchCertificatKey(infoLocal.chaineCertificats[0], infoLocal.cleFin)
    //
    //   if(cleCertMatch) {
    //     const updateInfo = {...infoLocal, idmgUsager, backupRacine: true}
    //     this.setState(updateInfo)
    //   } else {
    //     console.warn("Cle / certificats de match pas")
    //   }
    // } else {
    //   // Certificat absent ou invalide
    // }

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

  // genererCertsViaRacine = async event => {
  //   const idmgUsager = this.state.idmgUsager
  //
  //   // console.debug("State genererCertsViaRacine")
  //   const intermediaire = await genererNouveauIntermediaire(idmgUsager, this.state.racineCert, this.state.racinePrivatePem)
  //   // console.debug("Certificats et cles Intermediaire")
  //   // console.debug(intermediaire)
  //
  //   const fin = await genererNouveauFin(idmgUsager, intermediaire.cert, intermediaire.clePriveePEM)
  //   // console.debug("Certificats et cles Fin")
  //   // console.debug(fin)
  //
  //   const chaineCertificats = [
  //     fin.certPEM,
  //     intermediaire.certPEM,
  //     this.state.racineCertPem,
  //   ]
  //
  //   // Associer le IDMG au compte usager
  //   const messageAssociationIdmg = {
  //     idmg: idmgUsager,
  //     chaineCertificats: chaineCertificats.slice(1),
  //   }
  //   const commandeUrl = this.props.apiUrl + '/associerIdmg'
  //   console.debug("Transmission association %s", commandeUrl)
  //   const reponseAjout = await axios.post(commandeUrl, messageAssociationIdmg)
  //   console.debug("Reponse ajout :")
  //   console.debug(reponseAjout)
  //   if(reponseAjout.status !== 200) {
  //     throw new Error("Erreur association idmg au compte")
  //   }
  //
  //   this.setState({
  //     chaineCertificats,
  //     backupRacine: true,
  //     cleIntermediaire: intermediaire.clePriveePEM,
  //     cleFin: fin.clePriveePEM,
  //
  //     racinePrivatePem: null, // Eliminer la cle privee de la MilleGrille
  //   }, ()=>{conserverVersLocal({...this.state})})
  // }

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
          // genererCertsViaRacine={this.genererCertsViaRacine}
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
            <Button onClick={this.props.genererCertsViaRacine}>Suivant -- DESACTIVE --</Button>
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

function genererUrlDataDownload(jsonContent) {
  const stringContent = JSON.stringify(jsonContent)
  const blobFichier = new Blob([stringContent], {type: 'application/json'})
  let dataUrl = window.URL.createObjectURL(blobFichier)
  return dataUrl
}
