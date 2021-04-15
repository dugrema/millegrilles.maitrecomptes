import React from 'react'
import {Button, Form, Container, Row, Col, Nav, Alert, Modal} from 'react-bootstrap'
import axios from 'axios'
import { Trans } from 'react-i18next'

import { initialiserNavigateur, sauvegarderCertificatPem, resetCertificatPem, getFingerprintPk} from '../components/pkiHelper'
import { getCsr } from '@dugrema/millegrilles.common/lib/browser/dbUsager'

import { PrendrePossession } from './AuthentificationPrendrePossession'
import {
  AuthentifierWebauthn, AuthentifierMotdepasse, AuthentifierTotp,
  AuthentifierCertificatMillegrille, AuthentifierCsr
} from './MethodesAuthentification'
import { InscrireUsager } from './InscrireUsager'

const CHARS_SUPPORTES_NOM = 'abcdefghijklmnopqrstuvwxyz0123456789-_.@'

export class Authentifier extends React.Component {

  state = {
    infoCharge: false,  // True lorsque l'appel de chargerInformationAuthentification() est autoComplete
    nomUsager: localStorage.getItem('usager') || '',
    attendreVerificationUsager: false,
    attenteReponse: false,

    etatUsager: '',

    challengeCertificat: '',
    challengeWebauthn: '',
    motdepasseDisponible: false,
    totpDisponible: false,
    certificatNavigateur: '',

    tokenTotp: '',

    // motdepassePresent: false,
    operationsPki: false,
    infoCertificat: null,  // Certificat local

    accesRefuse: false,
    err: '',
  }

  componentDidMount() {
    chargerInformationAuthentification(this.props.authUrl)
    .then(async resultat => {
      console.debug("chargerInformationAuthentification: %O", resultat)
      await this.props.setUsagerAuthentifie(resultat.nomUsager, resultat.estProprietaire)
      this.setState({infoCharge: true})
    })
    .catch(err=>{console.error("Erreur componentDidMount, chargerInformationAuthentification"); console.error(err)})
  }

  setErreur = err => {
    this.setState({err})
  }

  boutonUsagerSuivant = async (event) => {
    event.preventDefault()
    event.stopPropagation()

    // console.debug("Authentifier")
    this.setState({attendreVerificationUsager: true})
    const nomUsager = this.state.nomUsager
    const data = {
      nomUsager,
    }

    // Verifier et valider chaine de certificat/cle local si presentes
    const infoCertNavigateur = await initialiserNavigateur(this.state.nomUsager)
    if(infoCertNavigateur && infoCertNavigateur.certificatValide) {
      // console.debug("Info cert navigateur : %O", infoCertNavigateur)
      data.certificatNavigateur = infoCertNavigateur
      this.setState({certificatNavigateur: infoCertNavigateur.fullchain})

      // console.debug("Preparation formatteur de messages pour %s", nomUsager)
      await this.props.rootProps.preparerSignateurTransactions(nomUsager)
      // console.debug("Formatteur de messages")

    } else {
      console.debug("Navigateur, certificat absent ou invalide : %O", infoCertNavigateur)
      if(infoCertNavigateur.csr) {
        // On a un CSR. On met le fingerprint pour recuperer le certificat correspondant
        data.fingerprintPk = infoCertNavigateur.fingerprintPk
      }
    }

    try {
      // console.debug("Post verifierUsager : %O", data)
      const response = await axios.post(this.props.authUrl + '/verifierUsager', data)
      // console.debug("Response /verifierUsager")
      // console.debug(response)

      const update = {
        etatUsager: 'connu',
        usagerVerifie: true,
        ...response.data
      }
      // console.debug(update)

      const certificat = response.data.certificat
      if(certificat) {
        // console.debug("Recu nouveau certificat de navigateur (via match fingerprintPk)")
        const certificatChaine = certificat.join('\n')
        sauvegarderCertificatPem(nomUsager, certificat[0], certificatChaine)
        update.certificatNavigateur = certificatChaine
      }

      this.setState(update, ()=>{console.debug("State apres ouverture usager :\n%O", this.state)})

    } catch(err) {
      if(err.response && err.response.status === 401) {
        this.setState({etatUsager: 'inconnu'})
      } else {
        console.error("Erreur verification usager")
        console.error(err);
      }
    }

  }

  boutonOperationsPki = event => {
    this.setState({operationsPki: true})
  }

  changerNomUsager = (event) => {
    const value = event.currentTarget.value.toLowerCase()

    // var nbAtSign = 0
    for(let idx=0; idx<value.length; idx++) {
      const charCourant = value[idx]
      // if(charCourant === '@') nbAtSign++
      if(CHARS_SUPPORTES_NOM.indexOf(charCourant) === -1) {
        return  // Invalide
      }
    }

    // if(nbAtSign > 1) return  // Invalide

    this.setState({nomUsager: value})
  }

  annuler = event => {
    this.setState({
      usagerVerifie: false,
      attendreVerificationUsager: false,
      operationsPki: false
    })
  }

  soumettreAuthentification = async (data, opts) => {
    this.setState({accesRefuse: false, attenteReponse: true})
    console.debug("Form info : %O, opts", data, opts)
    var reussi = false
    try {
      const postUrl = this.props.authUrl + '/ouvrir'
      const reponseLogin = await axios.post(postUrl, data)
      console.debug("Reponse login : %O", reponseLogin)
      if(reponseLogin.status === 200) {
        this.props.setUsagerAuthentifie(this.state.nomUsager, false)
        reussi = true
      } else {
        if(!opts.noerror) {
          console.debug("Acces refuse (1)")
          this.setState({accesRefuse: true})
          this.setErreur("Acces refuse")
        }
      }
    } catch(err) {
      if(!opts.noerror) {
        if(err.isAxiosError) {
          if(err.response.status === 401) {
            // Acces refuse par le serveur, mauvais credentials
            this.setErreur('')
            this.setState({accesRefuse: true})
            return false
          }
        }
        console.debug("Acces refuse (2), %O", err)
        this.setErreur(err)
        this.setState({accesRefuse: true})
      }
    } finally {
      this.setState({attenteReponse: false})
    }

    return reussi
  }

  resetCertificat = async event => {
    await resetCertificatPem(this.props.rootProps.nomUsager)
    this.setState({certificatNavigateur: ''})
  }

  render() {

    var accesRefuse = ''
    if(this.state.accesRefuse) {
      accesRefuse = (
        <Alert variant="danger">
          <Alert.Heading>Erreur acces</Alert.Heading>
          <p>Code ou mot de passe invalide.</p>
        </Alert>
      )
    }

    let formulaire, fullWidth = false
    if(!this.state.infoCharge) {
      formulaire = <div></div>
    } else if(!this.props.rootProps.proprietairePresent) {
      // Nouvelle MilleGrille, on presente le bouton de prise de possession
      formulaire = <PrendrePossession idmg={this.props.rootProps.idmgServeur} authUrl={this.props.authUrl} />
    } else if(!this.state.attendreVerificationUsager) {
      formulaire = (
        <>
          <SaisirUsager
            authUrl={this.props.authUrl}
            boutonUsagerSuivant={this.boutonUsagerSuivant}
            changerNomUsager={this.changerNomUsager}
            nomUsager={this.state.nomUsager}
            boutonOperationsPki={this.boutonOperationsPki}
            erreurMotdepasse={this.props.erreurMotdepasse}
            u2fAuthRequest={this.state.u2fAuthRequest}
            rootProps={this.props.rootProps}/>
        </>
      )
    } else {
      if(this.state.etatUsager === 'connu') {
        formulaire = (
          <>
            {accesRefuse}
            <AuthentifierUsager
              soumettreAuthentification={this.soumettreAuthentification}
              annuler={this.annuler}
              nomUsager={this.state.nomUsager}
              authUrl={this.props.authUrl}
              setUsagerAuthentifie={this.props.setUsagerAuthentifie}
              infoCompteUsager={this.state}
              certificatNavigateur={this.state.certificatNavigateur}
              setErreur={this.setErreur}
              resetCertificat={this.resetCertificat}
              attenteReponse={this.state.attenteReponse}
              rootProps={this.props.rootProps}/>
          </>
        )
      } else if (this.state.etatUsager === 'inconnu') {
        formulaire =
          <InscrireUsager
            annuler={this.annuler}
            nomUsager={this.state.nomUsager}
            authUrl={this.props.authUrl} />
      }
      else {
        formulaire = <AttendreVerificationUsager />
      }
    }

    var layoutColonnes
    if(fullWidth) {
      layoutColonnes = <Row><Col>{formulaire}</Col></Row>
    } else {
      layoutColonnes = (
        <Row>
          <Col sm={1} md={2}></Col>
          <Col sm={10} md={8}>
            {formulaire}
          </Col>
          <Col sm={1} md={2}></Col>
        </Row>
      )
    }

    return (
      <Container>
        <AlertErreur err={this.state.err}/>

        {layoutColonnes}

      </Container>
    )

  }
}

function AlertErreur(props) {
  var stack = ''
  if(props.err) {
    stack = <pre>{props.err.stack}</pre>
  }
  return (
    <Alert variant="danger" show={props.err?true:false}>
      <Alert.Heading>Erreur</Alert.Heading>
      <p>{''+props.err}</p>
      {stack}
    </Alert>
  )
}

function ResetCertificat(props) {
  if(!props.certificatNavigateur) return ''

  return (
    <>
      <Row className="troubleshooting">Troubleshooting</Row>
      <Row>
        <Col>
          Certificat:{' '}
          <Button onClick={props.reset} variant="secondary">Reset</Button>{' '}
          <Button onClick={props.login} variant="secondary">Login</Button>
        </Col>
      </Row>
    </>
  )
}

function AttendreVerificationUsager() {
  return (
    <p>Attendre verification de votre nom d'usager</p>
  )
}

class SaisirUsager extends React.Component {

  state = {
    cacherErreur: false,
  }

  dismiss = () => {
    this.setState({cacherErreur: true})
  }

  render() {

    var renderErreur
    if(this.props.erreurMotdepasse && !this.state.cacherErreur) {
      renderErreur = (
        <Alert variant="danger" onClose={() => this.dismiss()} dismissible>
          <Alert.Heading>Erreur mot de passe</Alert.Heading>
          <p>
            Mot de passe invalide.
          </p>
        </Alert>
      )
    }

    return (
      <div>
        {renderErreur}

        <div className="form-login">

          <Row>
            <Col>
              <p><Trans>authentification.accesPrive</Trans></p>
              <Form onSubmit={this.props.boutonUsagerSuivant} disabled={!this.props.nomUsager}>
                <Form.Group controlId="formNomUsager">
                  <Form.Label>Nom d'usager</Form.Label>
                  <Form.Control
                    type="text"
                    placeholder="Saisissez votre nom d'usager ici"
                    value={this.props.nomUsager}
                    onChange={this.props.changerNomUsager} />
                  <Form.Text className="text-muted">
                      Si vous voulez creer un nouveau compte, entrez votre nom d'usager desire et cliquez sur Suivant.
                  </Form.Text>
                </Form.Group>

                <Button type="submit" disabled={!this.props.nomUsager} variant="primary">Suivant</Button>
              </Form>
            </Col>
          </Row>

        </div>
      </div>
    )
  }
}

export class AuthentifierUsager extends React.Component {

  state = {
    typeAuthentification: 'certificat',
    debugInfo: '',

    // Information de certificat local
    certificatNavigateur: '',
    fullchainNavigateur: '',
    csr: '',
  }

  componentDidMount() {
    this.initialiserAuthentification()
    getCsr(this.props.nomUsager)
      .then(resultat=>{
        if(resultat) {
          console.debug("CSR charge : %O", resultat)
          this.setState({csr: resultat.csr})
        }
      })
  }

  async initialiserAuthentification() {

    // const infoCertNavigateur = initialiserNavigateur(this.props.nomUsager)

    // console.debug("!!! initialiserAuthentification Proppys: %O", this.props)
    const infoCompteUsager = this.props.infoCompteUsager
    const nomUsager = infoCompteUsager.nomUsager

    var defaultKey = null;
    const cw = this.props.rootProps.connexionWorker

    // Verifier si on fait un auto-login
    const authentificationPrimaire = this.props.authentificationPrimaire,
          authentificationSecondaire = this.props.authentificationSecondaire
    if(authentificationPrimaire === 'cleMillegrille' || authentificationSecondaire === 'cleMillegrille') {
      // La cle de millegrille a ete verifiee et acceptee, on fait juste continuer
      // console.debug("Auto-upgrade avec cle de millegrille deja acceptee")
      return this.props.soumettreAuthentification()
    }

    if(await cw.isFormatteurReady()) {

      console.debug("Formatteur de message disponible pour auto-login")
      // defaultKey = 'certificat'

      // Tenter auto-login avec le certificat
      if( infoCompteUsager.challengeCertificat ) {
        var reussi = await this.autoLoginCertificat({noerror: true})
        console.debug("Reponse autologin certificat : %O", reussi)
        if(!reussi) defaultKey = null
      } else {
        this.props.setErreur("Echec auto-login")
      }

    } else {
      this.props.setErreur("Formatteur non pret")
    }

    if(!defaultKey) {
      if(infoCompteUsager.challengeWebauthn) {
        defaultKey = 'webauthn'
      } else if(infoCompteUsager.methodesDisponibles.length > 0) {
        // Retirer la methode certificat (auto-login a deja echoue)
        const methodes = infoCompteUsager.methodesDisponibles.filter(item=>item !== 'certificat')

        // Prendre la premiere methode (au hasard)
        if(methodes.length > 0) defaultKey = methodes[0]
      }
    }

    var activationsDisponibles = infoCompteUsager.activationsDisponibles
    console.debug("Activations disponibles : %O", activationsDisponibles)
    var activationDisponible = false
    if(activationsDisponibles) {
      const {fingerprint_pk} = await getFingerprintPk(nomUsager)
      console.debug("Fingerprint extrait : %O", fingerprint_pk)
      if(fingerprint_pk) {
        activationsDisponibles = activationsDisponibles.filter(item=>item===fingerprint_pk)
        activationDisponible = activationsDisponibles.length > 0
      }
    }

    if(!defaultKey || defaultKey === 'cleMillegrille') {
      // On n'a aucune 2e methode d'authentification - on fait autologin
      console.debug("2e facteur non disponible, autologin")
      await this.props.soumettreAuthentification()
    } else {
      console.debug("Default key : %s", defaultKey)
    }

    this.setState({
      typeAuthentification: defaultKey,
      activationDisponible,
    }, ()=>{
      console.debug("initialiserAuthentification : %O\nprops: %O", this.state, this.props)
    })

  }

  changerTokenTotp = event => {
    const {value} = event.currentTarget
    this.setState({tokenTotp: value})
  }

  changerMotdepasse = event => {
    const {value} = event.currentTarget

    this.setState({
      motdepasse: value,
    })
  }

  setReponseCertificat = signature => {
    const reponseCertificat = {...this.props.challengeCertificat, '_signature': signature}
    this.setState({reponseCertificat}, _=>{console.debug("State apres signature cert : %O", this.state)})
  }

  autoLoginCertificat = async opts => {
    const challengeCertificat = this.props.infoCompteUsager.challengeCertificat
    console.debug("Challenge certificat :\n%O", challengeCertificat)

    var messageReponse = {
      ...this.props.infoCompteUsager.challengeCertificat,
      nomUsager: this.props.nomUsager,
    }

    messageReponse = await this.props.rootProps.webWorker.formatterMessage(
      messageReponse, 'MaitreDesComptes.authentifier', {attacherCertificat: true}
    )

    // const data = {
    //   nomUsager: this.props.nomUsager,
    //   certificatFullchainPem: this.state.fullchainNavigateur,
    //   reponseCertificat,
    // }

    console.debug("Autologin certificat : %O", messageReponse)
    try {
      return this.props.soumettreAuthentification(messageReponse, opts) //, {noerror: true})
    } catch(err) {
      this.props.setErreur(err)
    }
  }

  changerTypeAuthentification = selectedType => {
    this.setState({typeAuthentification: selectedType})
  }

  render() {

    var methodesDisponibles = []
    if(this.props.infoCompteUsager) {
      methodesDisponibles = this.props.infoCompteUsager.methodesDisponibles || []
    }

    var ElementAuthentification = ''
    console.debug("Type authentification : %s", this.state.typeAuthentification)
    switch(this.state.typeAuthentification) {
      case 'webauthn':
        ElementAuthentification = AuthentifierWebauthn
        break
      case 'motdepasse':
        ElementAuthentification = AuthentifierMotdepasse
        break
      case 'totp':
        ElementAuthentification = AuthentifierTotp
        break
      case 'csr':
        ElementAuthentification = AuthentifierCsr
        break
      case 'clemillegrille':
        ElementAuthentification = AuthentifierCertificatMillegrille
        break
      default:
        ElementAuthentification = props => {
          return <p>Methode non disponible</p>
        }
    }

    return (

      <Form>

        <p>Usager : {this.props.nomUsager}</p>

        <Nav variant="tabs" activeKey={this.state.typeAuthentification} onSelect={this.changerTypeAuthentification}>
          <Nav.Item>
            <Nav.Link eventKey="webauthn" disabled={!this.props.infoCompteUsager.challengeWebauthn && !this.state.activationDisponible}>Webauthn</Nav.Link>
          </Nav.Item>
          <Nav.Item>
            <Nav.Link eventKey="totp" disabled={!methodesDisponibles.includes('totp')}>TOTP</Nav.Link>
          </Nav.Item>
          <Nav.Item>
            <Nav.Link eventKey="motdepasse" disabled={!methodesDisponibles.includes('motdepasse')}>Mot de passe</Nav.Link>
          </Nav.Item>
          <Nav.Item>
            <Nav.Link eventKey="clemillegrille" disabled={!methodesDisponibles.includes('cleMillegrille')}>Cle de MilleGrille</Nav.Link>
          </Nav.Item>
          <Nav.Item>
            <Nav.Link eventKey="csr" disabled={!this.state.csr}>QR</Nav.Link>
          </Nav.Item>
        </Nav>

        <ElementAuthentification nomUsager={this.props.nomUsager}
                                 infoCompteUsager={this.props.infoCompteUsager}
                                 soumettreAuthentification={this.props.soumettreAuthentification}
                                 rootProps={this.props.rootProps}
                                 annuler={this.props.annuler}
                                 setRegistration={this.props.setRegistration}
                                 csr={this.state.csr} />

        <ResetCertificat certificatNavigateur={this.props.certificatNavigateur}
                         reset={this.props.resetCertificat}
                         login={this.autoLoginCertificat} />

      </Form>
    )
  }

}

async function chargerInformationAuthentification(authUrl) {
  const axiosConfig = {
    url: authUrl + '/verifier',
    method: 'GET',
    validateStatus: function (status) {
        return status === 201 || status === 401
      }
  }

  var resultat = null

  try {
    const reponse = await axios(axiosConfig)

    console.debug("Reponse verification cookie session : %O", reponse)

    if(reponse.status === 201) {
      // Conserver le nom de l'usager, redirige vers la liste des applications disponibles
      const valeurs = {
        nomUsager: reponse.headers['user-name'],
        userId: reponse.headers['user-id'],
      }

      // Set resultat
      resultat = {}
      for(let key in valeurs) {
        if(valeurs[key]) resultat[key] = valeurs[key]
      }

    } else if(reponse.status === 401) {
      // Usager non authentifie

      resultat = {
        valeurs: null,
        estProprietaire: null,
        attendreVerificationUsager: false
      }
    }

  } catch(err) {
    if(err.response) {
      const statusCode = err.response.status
      console.error("Erreur verification cookie session, status code %s : %O", statusCode, err)
    } else {
      console.error("Erreur connexion serveur : %O", err)
    }
  }

  return resultat

}
