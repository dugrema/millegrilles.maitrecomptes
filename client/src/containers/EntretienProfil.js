import React from 'react'
import {Button, Form, Container, Row, Col, Nav, Alert} from 'react-bootstrap'
// import {createHash} from 'crypto'
// import axios from 'axios'
import authenticator from 'authenticator'
import QRCode from 'qrcode.react'
import QrReader from 'react-qr-reader'
import {pki as forgePki} from 'node-forge'

// import {MilleGrillesCryptoHelper} from '@dugrema/millegrilles.common/lib/cryptoSubtle'
import { extraireExtensionsMillegrille, splitPEMCerts } from '@dugrema/millegrilles.common/lib/forgecommon'
import { hacherCertificat } from '@dugrema/millegrilles.common/lib/hachage'
// import { solveRegistrationChallenge } from '@webauthn/client'
import { getCertificats, resetCertificatPem } from '@dugrema/millegrilles.common/lib/browser/dbUsager'
import { repondreRegistrationChallenge } from '@dugrema/millegrilles.common/lib/browser/webauthn'
import { detecterAppareilsDisponibles } from '@dugrema/millegrilles.common/lib/detecterAppareils'

export class ActionsProfil extends React.Component {

  state = {
    page: '',
    alerte: null,
  }

  setPage = page => {
    this.setState({page: MAP_PAGES[page]})
  }

  setAlerte = alerte => {
    console.debug("Set alerte")
    console.debug(alerte)
    this.setState({alerte})
  }

  revenir = event => {
    this.setState({page: ''})
  }

  render() {
    var Page = this.state.page;
    if(!Page) Page = PageActions

    return <Page {...this.props}
      revenir={this.revenir}
      revenirParent={this.props.revenir}
      setPage={this.setPage}
      alerte={this.state.alerte}
      setAlerte={this.setAlerte} />
  }
}

function PageActions(props) {

  const options = []
  options.push(<Nav.Link key='ChangerMotdepasse' eventKey='ChangerMotdepasse'>Changer mot de passe</Nav.Link>)
  options.push(<Nav.Link key='AjouterU2f' eventKey='AjouterU2f'>Ajouter token U2F</Nav.Link>)
  options.push(<Nav.Link key='Authenticator' eventKey='AuthenticatorConfiguration'>Authenticator (TOTP)</Nav.Link>)
  options.push(<Nav.Link key='CertificatNavigateur' eventKey='CertificatNavigateur'>Certificat de navigateur</Nav.Link>)
  options.push(<Nav.Link key='ActiverCSR' eventKey='ActiverCSR'>Activer code QR de CSR</Nav.Link>)

  var alerte = null
  if(props.alerte) {
    var titre = null
    if(props.alerte.titre) {
      titre = <Alert.Heading>{props.alerte.titre}</Alert.Heading>
    }
    alerte = (
      <Alert variant="danger" onClose={() => {props.setAlerte(null)}} dismissible>
        {titre}
        <p>
          {props.alerte.contenu}
        </p>
      </Alert>
    )
  }

  return (
    <Container>
      {alerte}
      <Nav className="flex-column" onSelect={props.setPage}>
        {options}
        <Nav.Link onClick={props.revenirParent}>Retour</Nav.Link>
      </Nav>
    </Container>
  )
}

class AjouterU2f extends React.Component {

  state = {
    desactiverAutres: false,
    challenge: '',
  }

  componentDidMount() {
    // Note : chargement du challenge en premier
    //        le iPhone (Safari iOS) ne permet pas de callback du worker (await)
    //        pour le fingerprint reader (default a cle externe)
    this.fetchChallenge()
  }

  async fetchChallenge() {
    const cw = this.props.rootProps.connexionWorker
    const challenge = await cw.declencherAjoutWebauthn()
    this.setState({challenge})
  }

  toggleDesactiverAutres = event => {
    this.setState({desactiverAutres: !this.state.desactiverAutres})
  }

  ajouterToken = async event => {

    const nomUsager = this.props.rootProps.nomUsager
    const cw = this.props.rootProps.connexionWorker
    const challenge = this.state.challenge // await cw.declencherAjoutWebauthn()
    console.debug("Challenge registration webauthn additionnelle pour %s : %O", nomUsager, challenge)

    const reponseChallenge = await repondreRegistrationChallenge(nomUsager, challenge, {DEBUG: true})

    const params = {
      desactiverAutres: this.state.desactiverAutres,
      reponseChallenge
    }

    const resultatAjout = await cw.repondreChallengeRegistrationWebauthn(params)

    if(resultatAjout) this.props.revenir()
    else {
      this.props.setAlerte({titre: 'Echec', contenu: 'Erreur ajout nouveau token U2F'})
    }

  }

  render() {
    return (
      <Container>
        <Form>
          <p>Ajouter un token U2F a votre compte.</p>

          <Form.Group controlId="formDesactiverAutresCles">
            <Form.Check type="checkbox" name="desactiverAutres"
              defaultChecked={this.state.desactiverAutres}
              onChange={this.toggleDesactiverAutres}
              label="Desactiver toutes les autres cles existantes" />
          </Form.Group>

          <Button onClick={this.ajouterToken} disabled={!this.state.challenge}>Ajouter</Button>
          <Button onClick={this.props.revenir}>Retour</Button>
        </Form>
      </Container>
    )
  }
}

class AuthenticatorConfiguration extends React.Component {

  state = {
    token: '',
    cleSecrete: '',
    verification: '',
    certificats: ''
  }

  componentDidMount() {
    const cleSecrete = authenticator.generateKey()
    this.setState({cleSecrete})

    console.debug("Cle secrete TOTP : %s", cleSecrete)

    var formattedToken = authenticator.generateToken(cleSecrete);
    console.debug("formattedToken : %s", formattedToken)

    const cw = this.props.rootProps.connexionWorker
    cw.getCertificatsMaitredescles().then(certs=>{
      console.debug("Chargement certificat maitre des cles %O", certs)
      this.setState({certificats: certs})
    })

    // wsa.generateKeyAuthenticator().then(totpInfo=>{
    //   console.debug("TOTP info : %O", totpInfo)
    //   const cleSecrete = totpInfo.formattedKey
    //   this.setState({cleSecrete})
    // }).catch(err=>{
    //   console.error("Erreur generer TOTP : %O", err)
    // })

  }

  changerChamp = event => {
    const {name, value} = event.currentTarget
    this.setState({[name]: value, verification: false})
  }

  verifierToken = async event => {
    const tokenVerifie = authenticator.verifyToken(this.state.cleSecrete, this.state.token)
    if(tokenVerifie && tokenVerifie.delta === 0) {
      console.debug("Verification token : OK!")
      this.setState({verification: 'Token Ok, sauvegader en cours...'})

      console.debug("Certificat pour chiffrer : %O", this.state.certificats)
      const certificat = this.state.certificats.certificat.join('\n')
      console.debug("Certificat : %O", certificat)

      // Soumettre le code pour l'usager
      const webWorker = this.props.rootProps.webWorker
      const cw = this.props.rootProps.connexionWorker

      try {
        const succes = await soumettreNouveauCodeTOTP(
          cw, webWorker, certificat, this.props.rootProps.nomUsager, this.state.cleSecrete)

        if(succes) {
          this.setState({verification: 'Sauvegarde OK'})
        } else {
          this.setState({verification: 'Token ok, Echec sauvegarde'})
        }
      } catch(err) {
        console.error("Erreur sauvegarder totp: %O", err)
        this.setState({verification: 'Token ok, Echec sauvegarde : ' + err})
      }

    } else {
      console.error("Verification token : erreur, erreur : %O", tokenVerifie)
      this.setState({verification: 'Token invalide'})
    }
  }

  render() {

    const titreApp = "MilleGrilles - " + this.props.rootProps.idmgCompte
    const uri = authenticator.generateTotpUri(this.state.cleSecrete, "proprietaire", titreApp, 'SHA1', 6, 30)

    var qrCode = <QRCode value={uri} size={200} />

    return (
      <Container>

        <h1>Configuration authenticator</h1>

        <div>
          {qrCode}
        </div>

        <p>Nouveau code : {this.state.cleSecrete}</p>

        <p>
          Ajouter ce code a votre application authenticator et entrer le code
          pour verifier que la configuration fonctionne.
        </p>

        <p>
           Note : la verification du nouveau code va invalider tous vos codes
           Authenticator precedents.
        </p>

        <div>
          <Form.Group controlId="formNomUsager">
            <Form.Label>Code</Form.Label>
            <Form.Control type="text" name="token" value={this.state.token} onChange={this.changerChamp}/>
          </Form.Group>
        </div>

        <Alert show={this.state.verification?true:false} variant="primary">
          <p>{this.state.verification}</p>
        </Alert>

        <div>
          <Button onClick={this.verifierToken}>Verifier</Button>
          <Button onClick={this.props.revenir}>Retour</Button>
        </div>

      </Container>
    )
  }
}

// function desactiverMotdepasse(event) {
//   const {apiurl} = event.currentTarget.dataset
//   axios.post(apiurl + '/desactiverMotdepasse')
//   .then(reponse=>{
//     // console.debug("Mot de passe desactive")
//   })
//   .catch(err=>{
//     console.error("Erreur desactivation mot de passe")
//     console.error(err)
//   })
// }

// function desactiverU2f(event) {
//   const {apiurl} = event.currentTarget.dataset
//   axios.post(apiurl + '/desactiverU2f')
//   .then(reponse=>{
//     // console.debug("U2F desactive")
//   })
//   .catch(err=>{
//     console.error("Erreur desactivation U2f")
//     console.error(err)
//   })
// }

class ChangerMotdepasse extends React.Component {

  state = {
    motdepasseNouveau1: '',
    motdepasseNouveau2: '',
    motdepasseMatch: false,
  }

  changerMotdepasse = event => {
    const {name, value} = event.currentTarget

    this.setState({[name]: value}, _=>{
      // Comparer mots de passe
      var motdepasseMatch = this.state.motdepasseNouveau1 === this.state.motdepasseNouveau2
      this.setState({motdepasseMatch})
    })
  }

  appliquerChangement = async event => {
    console.debug("Changement mot de passe")

    const cw = this.props.rootProps.connexionWorker
    const webWorker = this.props.rootProps.webWorker
    // const message = {motdepasse: this.state.motdepasseNouveau1}
    const nomUsager = this.props.rootProps.nomUsager

    // const reponse = await cw.changerMotdepasse(message)

    const resultatOk = await soumettreNouveauMotdepasse(cw, webWorker, nomUsager, this.state.motdepasseNouveau1)
    console.debug("Reponse changement mot de passe : %s", resultatOk)

    // this.props.rootProps.connexionSocketIo.emit('changerMotDePasse', changement, reponse => {
      if(resultatOk) {
        console.debug("Mot de passe change avec succes")
      } else {
        this.props.setAlerte({titre: 'Echec', contenu: 'Erreur changement de mot de passe'})
      }
      this.props.revenir()
    // })
  }

  desactiverMotdepasse = async event => {
    console.debug("Desactiver mot de passe - TODO")

    const wsa = this.props.rootProps.webSocketApp
    await wsa.desactiverMotdepasse()
    this.props.revenir()
  }

  render() {

    // name="" pour eviter de soumettre le mot de passe en clair
    return (
      <Container>
        <Form>
          <Form.Group controlId="formMotdepasseNouveau">
            <Form.Label>Nouveau mot de passe</Form.Label>
            <Form.Control
              type="password"
              className="motdepasse"
              name="motdepasseNouveau1"
              value={this.state.motdepasseNouveau1}
              autoComplete="new-password"
              onChange={this.changerMotdepasse}
              placeholder="Nouveau mot de passe" />
          </Form.Group>

          <Form.Group controlId="formMotdepasseNouveau2">
            <Form.Control
              type="password"
              className="motdepasse"
              name="motdepasseNouveau2"
              value={this.state.motdepasseNouveau2}
              autoComplete="new-password"
              onChange={this.changerMotdepasse}
              placeholder="Nouveau mot de passe" />
          </Form.Group>

          <Row>
            <Col className="button-list">

              <Button onClick={this.appliquerChangement}
                disabled={ ! this.state.motdepasseMatch } variant="dark">Changer</Button>

              <Button onClick={this.desactiverMotdepasse} variant="secondary">Desactiver</Button>

              <Button onClick={this.props.revenir} variant="secondary">Annuler</Button>

            </Col>
          </Row>
        </Form>

      </Container>
    )
  }
}

class CertificatNavigateur extends React.Component {

  state = {
    certificat: '',
    fullchain: '',
    expiration: '',
    afficherPem: false,
  }

  componentDidMount() {
    this.chargerCertificat()
  }

  async chargerCertificat() {
    const nomUsager = this.props.rootProps.nomUsager

    try {
      const resultat = await getCertificats(nomUsager)
      console.debug("Chargement info certs %s = %O", nomUsager, resultat)

      const certsSplit = splitPEMCerts(resultat.fullchain)
      console.debug("Certs split : %O", certsSplit)
      // const infoCertNavigateur = await extraireInformationCertificat(certsSplit[0])
      const certificatNavigateur = forgePki.certificateFromPem(certsSplit[0])
      const extensions = extraireExtensionsMillegrille(certificatNavigateur)
      console.debug("Info cert navigateur : %O, extensions %O", certificatNavigateur, extensions)

      // const {subject, issuer} = certificatNavigateur
      const fingerprint = await hacherCertificat(certificatNavigateur)

      // const infoCert = {
      //   o: subject.getField('O').value,
      //   ou: subject.getField('OU').value,
      //   cn: subject.getField('CN').value,
      // }
      // const infoIssuer = {
      //   o: issuer.getField('O').value,
      //   ou: issuer.getField('OU').value,
      //   cn: issuer.getField('CN').value,
      // }

      this.setState({
        ...resultat,
        // infoCert, infoIssuer,
        certificatNavigateur, extensions,
        fingerprint,
        expiration: certificatNavigateur.validity.notAfter,
      }, _=>{
        console.debug("State : %O", this.state)
      })
    } catch(err) {
      console.error("Erreur extraction information certificate navigateur : %O", err)
    }
  }

  resetCertificat = event => {
    const nomUsager = this.props.rootProps.nomUsager
    // const wsa = this.props.rootProps.webSocketapp
    resetCertificatPem(nomUsager)
  }

  afficherPem = event => {
    this.setState({afficherPem: true})
  }

  render() {

    var infoCert = ''
    if(this.state.certificatNavigateur) {
      infoCert = (
        <>
          <AfficherSubjectCertificat subject={this.state.certificatNavigateur.subject}
                                     extensions={this.state.extensions}
                                     fingerprint={this.state.fingerprint}
                                     expiration={this.state.certificatNavigateur.validity.notAfter} />
          <hr/>
          <AfficherSubjectCertificat subject={this.state.certificatNavigateur.issuer} />
        </>
      )
    }


    var afficherPem = ''
    if(this.state.afficherPem) {
      afficherPem = (
        <>
          <pre>
            {this.state.fullchain}
          </pre>
        </>
      )
    } else {
      afficherPem = (
        <Button onClick={this.afficherPem}>Afficher PEM</Button>
      )
    }

    return (
      <Container>

        <h1>Certificat du navigateur</h1>

        <h2>Reset certificat</h2>

        <Button onClick={this.resetCertificat}>
          Reset
        </Button>

        <h2>Details</h2>

        {infoCert}

        <h2>PEM</h2>
        {afficherPem}

      </Container>
    )
  }
}

function AfficherSubjectCertificat(props) {
  const subject = props.subject

  var expiration = ''
  if(props.expiration) {
    expiration = (
      <Row>
        <Col sm={2} lg={2}>Expiration :</Col>
        <Col>{''+props.expiration}</Col>
      </Row>
    )
  }

  return (
    <>
      <Row>
        <Col sm={2} lg={2}>Usager :</Col>
        <Col sm={10} lg={4}>{subject.getField('CN').value}</Col>
        <Col sm={2} lg={2}>Type :</Col>
        <Col sm={10} lg={4}>{subject.getField('OU').value}</Col>
      </Row>
      <Row>
        <Col sm={2} lg={2}>MilleGrille :</Col>
        <Col>{subject.getField('O').value}</Col>
      </Row>
      {expiration}
      <Extensions extensions={props.extensions} />
    </>
  )
}

function Extensions(props) {
  if(!props.extensions) return ''

  return (
    <Row>
      <Col sm={2} lg={2}>Securite :</Col>
      <Col sm={10} lg={4}>{''+props.extensions.niveauxSecurite}</Col>
      <Col sm={2} lg={2}>Roles :</Col>
      <Col sm={2} lg={4}>{''+props.extensions.roles}</Col>
    </Row>
  )
}

async function soumettreNouveauCodeTOTP(cw, webWorker, certificatMaitredescles, nomUsager, codeSecret) {

  // Preparer le secret
  const contenuSecret = {totp: codeSecret}

  // Associer la cle et la transaction de contenu avec meme identificateurs
  const identificateurs_document = {nomUsager, champ: 'totp'}
  const domaine = 'MaitreDesComptes'
  const infoChiffree = await webWorker.chiffrerDocument(
    contenuSecret, domaine, certificatMaitredescles, identificateurs_document)

  const commandeMaitredescles = infoChiffree.commandeMaitrecles

  var transactionCompteUsager = { nomUsager, totp: infoChiffree.ciphertext }
  transactionCompteUsager = await webWorker.formatterMessage(transactionCompteUsager, 'MaitreDesComptes.majUsagerTotp')
  console.debug("Transaction cles signee : %O\n%O", commandeMaitredescles, transactionCompteUsager)

  const reponse = await cw.sauvegarderSecretTotp(commandeMaitredescles, transactionCompteUsager)
  console.debug("Reponse sauvegarder totp : %O", reponse)
  const {reponseMaitredescles, reponseTotp} = reponse
  return reponseMaitredescles.succes && reponseTotp.succes
}

async function soumettreNouveauMotdepasse(cw, webWorker, nomUsager, motdepasse) {

  var certificatMaitredescles = await cw.getCertificatsMaitredescles()
  certificatMaitredescles = certificatMaitredescles.certificat.join('\n')
  console.debug("Certificat maitre des cles %O", certificatMaitredescles)

  // Preparer le secret
  const contenuSecret = {motdepasse}

  // Associer la cle et la transaction de contenu avec meme identificateurs
  const identificateurs_document = {nomUsager, champ: 'motdepasse'}
  const domaine = 'MaitreDesComptes'

  const infoChiffree = await webWorker.chiffrerDocument(
    contenuSecret, domaine, certificatMaitredescles, identificateurs_document)
  const commandeMaitredescles = infoChiffree.commandeMaitrecles

  var transactionCompteUsager = { nomUsager, motdepasse: infoChiffree.ciphertext }
  transactionCompteUsager = await webWorker.formatterMessage(transactionCompteUsager, 'MaitreDesComptes.majMotdepasse')
  console.debug("Transaction cles signee : %O\n%O", commandeMaitredescles, transactionCompteUsager)

  const reponse = await cw.changerMotdepasse({commandeMaitredescles, transactionCompteUsager})
  console.debug("Reponse sauvegarder mot de passe : %O", reponse)

  const {reponseMaitredescles, reponseMotdepasse} = reponse.resultat
  return reponseMaitredescles.succes && reponseMotdepasse.succes
}

class ActiverCSR extends React.Component {

  state = {
    appareils: '',  // videoinput doit etre dans la liste pour camera
    modeScanQR: false,
    modeCollerCSR: false,
    data: '',
    pem: '',
    pemTextArea: '',
    certificatOk: false,
    err: '',
  }

  componentDidMount() {
    detecterAppareilsDisponibles().then(apps=>{
      console.debug("Apps detectees : %O", apps);
      this.setState({appareils: apps})
    })
  }

  activerScanQr = _ => {this.setState({modeScanQR: true})}
  fermerScanQr = _ => {this.setState({modeScanQR: false})}
  erreurScanQr = event => {console.error("Erreur scan QR: %O", event); this.fermerScanQr()}

  activerCollerCSR = _=> {this.setState({modeCollerCSR: true})}

  handleScan = async data => {
    this.setState({data}, _=>{ this.traiterCsr() })
  }

  traiterCsr() {
    console.debug("State : %O", this.state)

    // Convertir data en base64, puis ajouter header/footer CSR
    const dataB64 = btoa(this.state.data)
    const pem = `-----BEGIN CERTIFICATE REQUEST-----\n${dataB64}\n-----END CERTIFICATE REQUEST-----`

    // Verifier avec nodeForge
    try {
      const csrForge = forgePki.certificationRequestFromPem(pem)
      const nomUsager = csrForge.subject.getField('CN').value

      if(this.props.rootProps.nomUsager !== nomUsager) {
        throw new Error(`Nom usager ${nomUsager} du code QR ne correspond pas a votre compte actuel`)
      }

      this.setState({data: '', err: '', pem, nomUsager, modeScanQR: false})
    } catch(err) {
      this.setState({err})
    }
  }

  setPemTextArea = event => {
    const pem = event.currentTarget.value
    this.setState({pemTextArea: pem})

    if(!pem) return

    // Valider le contenu
    try {
      const csrForge = forgePki.certificationRequestFromPem(pem)
      const nomUsager = csrForge.subject.getField('CN').value

      if(this.props.rootProps.nomUsager !== nomUsager) {
        throw new Error(`Nom usager ${nomUsager} du code QR ne correspond pas a votre compte actuel`)
      }

      this.setState({data: '', err: '', pem, nomUsager, modeCollerCSR: false})
    } catch(err) {
      console.error("Erreur PEM : %O", err)
    }

  }

  activer = async _ => {
    const cw = this.props.rootProps.connexionWorker
    const nomUsager = this.props.rootProps.nomUsager

    const requeteGenerationCertificat = {
      nomUsager,
      csr: this.state.pem,
      activationTierce: true,  // Flag qui indique qu'on active manuellement un certificat
    }
    console.debug("Requete generation certificat navigateur: \n%O", requeteGenerationCertificat)

    try {
      const reponse = await cw.genererCertificatNavigateur(requeteGenerationCertificat)
      console.debug("Reponse cert recue %O", reponse)
      // var {cert: certificatNavigateur, fullchain} = reponse
      if(reponse && !reponse.err) {
        this.setState({pem: '', err: '', certificatOk: true})
      } else {
        this.setState({pem: '', err: "Erreur reception confirmation d'activation"})
      }
    } catch(err) {
      console.error("Erreur activation CSR : %O", err)
      this.setState({err})
    }

  }

  render() {
    var errStack = ''
    if(this.err) {
      errStack = <pre>this.err.stack</pre>
    }

    return (
      <Container>
        <h2>Activer code QR</h2>

        <Alert variant="danger" show={this.err?true:false}>
          <Alert.Heading>Erreur</Alert.Heading>
          <p>{''+this.err}</p>
          {errStack}
        </Alert>

        <p>
          Cette page permet de copier ou scanner un code QR pour activer
          votre compte sur un nouvel appareil.
        </p>

        <Row>
          <Col>
            <BoutonScan modeScanQR={this.state.modeScanQR}
                        activerScanQr={this.activerScanQr}
                        fermerScanQr={this.fermerScanQr} />
          </Col>
        </Row>

        <QRCodeReader actif={this.state.modeScanQR}
                      handleScan={this.handleScan}
                      handleError={this.erreurScanQr} />

        <Row>
          <Col>
            <CollerCSR afficherCollerCsr={this.state.modeCollerCSR}
                       activerCollerCSR={this.activerCollerCSR}
                       changerTexte={this.setPemTextArea}
                       texte={this.state.pemTextArea} />
          </Col>
        </Row>

        <Alert variant="info" show={this.state.pem?true:false}>
          <Alert.Heading>Code QR pret</Alert.Heading>
          <p>Le code QR correspond a l'usager {this.state.nomUsager}</p>
          <p>
            Si cette information est correcte, cliquez sur le bouton activer pour poursuivre.
          </p>
        </Alert>

        <Alert variant="success" show={this.state.certificatOk}>
          <Alert.Heading>Succes</Alert.Heading>
          <p>
            Vous pouvez maintenant cliquer sur Suivant avec votre autre appareil,
            le compte est active.
          </p>
        </Alert>

        <Row>
          <Col className="button-list">
            <Button onClick={this.activer} variant="primary">Activer</Button>
            <Button onClick={this.props.revenir} variant="secondary">Annuler</Button>
          </Col>
        </Row>

      </Container>
    )
  }
}

function BoutonScan(props) {
  if(props.modeScanQR) {
    return <Button onClick={props.fermerScanQr}>Arreter</Button>
  } else {
    return <Button onClick={props.activerScanQr}>Scan</Button>
  }
}

function CollerCSR(props) {
  if(props.afficherCollerCsr) {
    return (
      <>
        <Form.Group>
          <Form.Label>Coller le CERTIFICATE REQUEST ici</Form.Label>
          <Form.Control as="textarea" rows={16} onChange={props.changerTexte} value={props.texte}/>
        </Form.Group>
      </>
    )
  } else {
    return <Button onClick={props.activerCollerCSR}>Coller CSR</Button>
  }
}

function QRCodeReader(props) {
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

const MAP_PAGES = {
  ActionsProfil, ChangerMotdepasse, AjouterU2f,
  AuthenticatorConfiguration, CertificatNavigateur, ActiverCSR,
}
