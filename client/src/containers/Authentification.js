import React from 'react'
import {Button, Form, Container, Row, Col, Nav} from 'react-bootstrap'
import axios from 'axios'
import {createHash} from 'crypto'
import {solveRegistrationChallenge, solveLoginChallenge} from '@webauthn/client'
import { Trans } from 'react-i18next'
import { v4 as uuidv4 } from 'uuid'
import {signerContenuString, chargerClePrivee} from 'millegrilles.common/lib/forgecommon'

import stringify from 'json-stable-stringify'

import { PkiInscrire, validerChaineCertificats } from './Pki'
import { genererNouveauCertificatMilleGrille, preparerInscription, genererNouveauCompte } from '../components/pkiHelper'

const CHARS_SUPPORTES_NOM = 'abcdefghijklmnopqrstuvwxyz0123456789-_.@'

export class Authentifier extends React.Component {

  state = {
    infoCharge: false,  // True lorsque l'appel de chargerInformationAuthentification() est autoComplete
    nomUsager: localStorage.getItem('usager') || '',
    attendreVerificationUsager: false,

    etatUsager: '',
    authRequest: '',
    challengeId: '',
    motdepassePresent: false,
    u2fRegistrationJson: '',
    operationsPki: false,
    infoCertificat: null,  // Certificat local
  }

  componentDidMount() {
    this.chargerInformationAuthentification(this.props.authUrl)
    .then(async resultat => {
      await this.props.setUsagerAuthentifie(resultat)
      this.setState({infoCharge: true})
    })
    .catch(err=>{console.error("Erreur componentDidMount, chargerInformationAuthentification"); console.error(err)})
  }

  async chargerInformationAuthentification(authUrl) {
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

      // console.debug("Reponse verification cookie session")
      // console.debug(reponse)

      if(reponse.status === 201) {
        // Conserver le nom de l'usager, redirige vers la liste des applications disponibles

        const valeurs = {
          nomUsager: reponse.headers['user-prive'],
          estProprietaire: reponse.headers['est-proprietaire'],
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
        console.error("Erreur verification cookie session, status code %s", statusCode)
        console.error(err)
      } else {
        console.error("Erreur connexion serveur")
        console.error(err)
      }

    }

    return resultat

  }

  // Authentification du proprietaire
  boutonOuvrirProprietaire = event => {
    // console.debug("Submit authentifier proprietaire")
    event.preventDefault()
    event.stopPropagation()
    const form = event.currentTarget;

    axios.post(this.props.authUrl + '/challengeProprietaire')
    .then(reponse=>{
      // console.debug("Reponse U2F challenge")
      // console.debug(reponse)
      const {authRequest, challengeId} = reponse.data
      solveLoginChallenge(authRequest)
      .then(credentials=>{
        const u2fAuthRequest = JSON.stringify(credentials)
        this.setState({authRequest: u2fAuthRequest, challengeId}, ()=>{
          // console.debug("Challenge pret, submit")
          // console.debug(this.state)
          form.submit()
        })
      })
      .catch(err=>{
        console.error("Erreur authentification proprietaire")
        console.error(err)
      })
    })
    .catch(err=>{
      console.error("Erreur requete challenge U2F proprietaire")
      console.error(err)
    })
  }

  boutonUsagerSuivant = async (event) => {
    event.preventDefault()
    event.stopPropagation()

    if(this.state.nomUsager.indexOf('@') === -1) {
      // Changer le nom d'usager, ajouter le nom du serveur local
      await new Promise((resolve, reject)=>{
        const nomUsagerServeur = this.state.nomUsager + '@mg-dev4.maple.maceroc.com'
        this.setState({nomUsager: nomUsagerServeur}, ()=>{resolve()})
      })
    }

    // console.debug("Authentifier")
    this.setState({attendreVerificationUsager: true})

    const params = new URLSearchParams()
    params.set('nom-usager', this.state.nomUsager)

    // Verifier et valider chaine de certificat/cle local si presentes
    const infoCertificat = validerChaineCertificats()
    this.setState({infoCertificat})

    if(infoCertificat.valide) {
      params.set('certificat-present', 'true')
    }

    try {
      const response = await axios.post(this.props.authUrl + '/verifierUsager', params.toString())
      console.debug("Response /verifierUsager")
      console.debug(response)

      const update = {
        etatUsager: 'connu',
        usagerVerifie: true,
        ...response.data
      }
      // console.debug(update)

      this.setState(update)

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

    var nbAtSign = 0
    for(let idx=0; idx<value.length; idx++) {
      const charCourant = value[idx]
      if(charCourant === '@') nbAtSign++
      if(CHARS_SUPPORTES_NOM.indexOf(charCourant) === -1) {
        return  // Invalide
      }
    }

    if(nbAtSign > 1) return  // Invalide

    this.setState({nomUsager: value})
  }

  annuler = event => {
    this.setState({
      usagerVerifie: false,
      attendreVerificationUsager: false,
      operationsPki: false
    })
  }

  actionPrendrePossession = event => {
    console.debug("Submit prendre possession")
    event.preventDefault()
    event.stopPropagation()
    const form = event.currentTarget

    var params = 'nom-usager=proprietaire'

    axios.post(this.props.authUrl + '/challengeRegistrationU2f', params)
    .then(reponse=>{
      console.debug("Reponse U2F challenge")
      console.debug(reponse)
      const {registrationRequest, challengeId} = reponse.data
      solveRegistrationChallenge(registrationRequest)
      .then(credentials=>{
        const u2fRegistrationJson = JSON.stringify(credentials)
        this.setState({u2fRegistrationJson, challengeId}, ()=>{
          console.debug("Challenge pret, submit")
          console.debug(this.state)
          form.submit()
        })
      })
      .catch(err=>{
        console.error("Erreur registration")
        console.error(err)
      })
    })
    .catch(err=>{
      console.error("Erreur requete challenge U2F")
      console.error(err)
    })
  }

  render() {

    let formulaire, fullWidth = false
    if(!this.state.infoCharge) {
      formulaire = <div></div>
    } else if(!this.props.rootProps.proprietairePresent) {
      // Nouvelle MilleGrille, on presente le bouton de prise de possession
      formulaire =
        <PrendrePossession
          authUrl={this.props.authUrl}
          u2fRegistrationJson={this.state.u2fRegistrationJson}
          challengeId={this.state.challengeId}
          actionPrendrePossession={this.actionPrendrePossession} />
    } else if(!this.state.attendreVerificationUsager) {
      formulaire =
        <SaisirUsager
          authUrl={this.props.authUrl}
          boutonUsagerSuivant={this.boutonUsagerSuivant}
          changerNomUsager={this.changerNomUsager}
          nomUsager={this.state.nomUsager}
          boutonOuvrirProprietaire={this.boutonOuvrirProprietaire}
          boutonOperationsPki={this.boutonOperationsPki}
          u2fAuthRequest={this.state.authRequest}
          challengeId={this.state.challengeId}
          rootProps={this.props.rootProps}/>
    } else {
      if(this.state.etatUsager === 'connu') {
        formulaire =
          <AuthentifierUsager
            annuler={this.annuler}
            nomUsager={this.state.nomUsager}
            redirectUrl={this.props.redirectUrl}
            authUrl={this.props.authUrl}
            idmg={this.props.idmg}
            u2fAuthRequest={this.state.authRequest}
            challengeId={this.state.challengeId}
            motdepassePresent={this.state.motdepassePresent}
            infoCertificat={this.state.infoCertificat} />
      } else if (this.state.etatUsager === 'inconnu') {
        formulaire =
          <InscrireUsager
            annuler={this.annuler}
            nomUsager={this.state.nomUsager}
            authUrl={this.props.authUrl}
            redirectUrl={this.props.redirectUrl}
            idmg={this.props.idmg} />
      } else {
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
        {layoutColonnes}
      </Container>
    )

  }
}

function AttendreVerificationUsager() {
  return (
    <p>Attendre verification de votre nom d'usager</p>
  )
}

function SaisirUsager(props) {

  return (
    <Container className="form-login">
      <Row>
        <Col>
          <p><Trans>authentification.accesProprietaire</Trans></p>
          <Form method="POST" onSubmit={props.boutonOuvrirProprietaire} action={props.authUrl + '/ouvrirProprietaire'}>
            <Form.Control key="redirectUrl" type="hidden"
              name="url" value={props.redirectUrl} />
            <Form.Control key="u2fClientJson" type="hidden"
              name="u2f-client-json" value={props.u2fAuthRequest} />
            <Form.Control key="u2fChallengeId" type="hidden"
              name="u2f-challenge-id" value={props.challengeId} />
            <Button type="submit" variant="success"><Trans>bouton.accesProprietaire</Trans></Button>
          </Form>
        </Col>
      </Row>

      <Row>
        <Col>
          <p><Trans>authentification.accesPrive</Trans></p>
          <Form onSubmit={props.boutonUsagerSuivant} disabled={!props.nomUsager}>
            <Form.Group controlId="formNomUsager">
              <Form.Label>Nom d'usager</Form.Label>
              <Form.Control
                type="text"
                placeholder="Saisissez votre nom d'usager ici"
                value={props.nomUsager}
                onChange={props.changerNomUsager} />
              <Form.Text className="text-muted">
                  Si vous voulez creer un nouveau compte, entrez votre nom d'usager desire et cliquez sur Suivant.
              </Form.Text>
            </Form.Group>

            <Button type="submit" disabled={!props.nomUsager} variant="dark">Suivant</Button>
          </Form>
        </Col>
      </Row>

    </Container>
  )
}

function PrendrePossession(props) {
  return (
    <Container>
      <Form method="POST" onSubmit={props.actionPrendrePossession} action={props.authUrl + '/prendrePossession'}>
        <Form.Control type="hidden" name="nom-usager" value="proprietaire" />
        <Form.Control type="hidden"
            name="u2f-registration-json" value={props.u2fRegistrationJson} />
        <Form.Control type="hidden"
            name="u2f-challenge-id" value={props.challengeId} />
        <Button type="submit" variant="success">Prendre possession</Button>
      </Form>
    </Container>
  )
}

class AuthentifierUsager extends React.Component {

  state = {
    motdepasse: '',
    motdepasseHash: '',
    u2fClientJson: '',
    typeAuthentification: 'u2f',
    certificatClientJson: '',
  }

  componentDidMount() {
    var defaultKey = null;
    if(this.props.infoCertificat.valide) {
      defaultKey = 'certificat'
    } else if(this.props.u2fAuthRequest) {
      defaultKey = 'u2f'
    } else {
      defaultKey = 'motdepasse'
    }
    this.setState({typeAuthentification: defaultKey})
  }

  changerMotdepasse = event => {
    const {value} = event.currentTarget;

    this.setState({
      motdepasse: value,
    })
  }

  authentifier = event => {
    event.preventDefault()
    event.stopPropagation()

    const form = event.currentTarget
    const authRequest = this.props.u2fAuthRequest

    if(this.state.typeAuthentification === 'u2f') {
      // Effectuer la verification avec cle U2F puis soumettre

      solveLoginChallenge(authRequest)
      .then(credentials=>{
        const u2fClientJson = JSON.stringify(credentials)
        this.setState({u2fClientJson}, ()=>{
          form.submit()
        })
      })
      .catch(err=>{
        console.error("Erreur challenge reply registration security key");
        console.error(err);
      });

    } else if(this.state.typeAuthentification === 'motdepasse') {
      var motdepasseHash = createHash('sha256').update(this.state.motdepasse, 'utf-8').digest('base64')
      this.setState({
        motdepasse: '', // Reset mot de passe (eviter de le transmettre en clair)
        motdepasseHash,
      }, ()=>{
        form.submit()
      })
    } else if(this.state.typeAuthentification === 'certificat') {
      const {cleFin, chaineCertificats} = this.props.infoCertificat.infoLocal
      const form = event.currentTarget
      const challengeId = this.props.challengeId

      // Repondre avec certs, challenge et signature
      // Signer une demande d'authentification
      const message = { chaineCertificats, challengeId }

      // Signer la chaine de certificats
      console.debug("Cle fin : %s", cleFin)
      const clePriveePki = chargerClePrivee(cleFin)
      const signature = signerContenuString(clePriveePki, stringify(message))
      console.debug("Signature")
      console.debug(signature)

      message['_signature'] = signature

      this.setState(
        {
          certificatClientJson: stringify(message)
        },
        ()=>{form.submit()}
      )
    }
  }

  changerTypeAuthentification = selectedType => {
    // console.debug("Changer type authentification : %s", selectedType)
    this.setState({typeAuthentification: selectedType})
  }

  render() {

    // Set params hidden : nom usager, url redirection au besoin
    const hiddenParams = [
    ]
    if(this.props.redirectUrl) {
      hiddenParams.push(<Form.Control key="redirectUrl" type="hidden"
        name="url" value={this.props.redirectUrl} />)
    }
    if(this.state.u2fClientJson) {
      hiddenParams.push(<Form.Control key="u2fClientJson" type="hidden"
        name="u2f-client-json" value={this.state.u2fClientJson} />)
    }
    if(this.state.certificatClientJson) {
      hiddenParams.push(<Form.Control key="certificatClientJson" type="hidden"
        name="certificat-client-json" value={this.state.certificatClientJson} />)
    }
    if(this.props.challengeId) {
      hiddenParams.push(<Form.Control key="challengeId" type="hidden"
        name="challenge-id" value={this.props.challengeId} />)
    }

    let formulaire;
    if(this.state.typeAuthentification === 'u2f') {
      formulaire = (
        <p>Inserer la cle U2F et cliquer sur suivant.</p>
      )
    } else if(this.state.typeAuthentification === 'motdepasse') {
      // Mot de passe
      // name="" pour eviter de soumettre le mot de passe en clair
      formulaire = (
        <Form.Group controlId="formMotdepasse">
          <Form.Label>Mot de passe</Form.Label>
          <Form.Control
            type="password"
            name=""
            value={this.state.motdepasse}
            autoComplete="current-password"
            onChange={this.changerMotdepasse}
            placeholder="Saisir votre mot de passe" />
        </Form.Group>
      )
    } else if(this.state.typeAuthentification === 'certificat') {
      formulaire = (
        <p>Utiliser le certificat IDMG = {this.props.infoCertificat.idmgUsager}.</p>
      )
    }

    return (
      <Form method="post" onSubmit={this.authentifier} action={this.props.authUrl + "/ouvrir"}>

        <Form.Control type="text" name="nom-usager" autoComplete="username"
          defaultValue={this.props.nomUsager} className="champ-cache"/>
        <Form.Control type="hidden" name="motdepasse-hash"
          value={this.state.motdepasseHash} />

        <p>Usager : {this.props.nomUsager}</p>

        <Nav variant="tabs" activeKey={this.state.typeAuthentification} onSelect={this.changerTypeAuthentification}>
          <Nav.Item>
            <Nav.Link eventKey="certificat" disabled={!this.props.infoCertificat.valide}>Certificat</Nav.Link>
          </Nav.Item>
          <Nav.Item>
            <Nav.Link eventKey="u2f" disabled={!this.props.u2fAuthRequest}>U2F</Nav.Link>
          </Nav.Item>
          <Nav.Item>
            <Nav.Link eventKey="motdepasse" disabled={!this.props.motdepassePresent}>Mot de passe</Nav.Link>
          </Nav.Item>
        </Nav>

        <Container className="boite-coinsronds boite-authentification">
          {formulaire}
        </Container>

        {hiddenParams}

        <Button type="submit" variant="dark">Suivant</Button>
        <Button onClick={this.props.annuler} variant="secondary">Annuler</Button>

      </Form>
    )
  }

}

class InscrireUsager extends React.Component {

  state = {
    typeAuthentification: 'u2f',
  }

  changerTypeAuthentification = selectedType => {
    // console.debug("Changer type authentification : %s", selectedType)
    this.setState({typeAuthentification: selectedType})
  }

  render() {

    // Set params hidden : nom usager, url redirection au besoin
    const optHiddenParams = []
    if(this.props.redirectUrl) {
      optHiddenParams.push(<Form.Control key="redirectUrl" type="hidden"
        name="url" value={this.props.redirectUrl} />)
    }

    let subform = <NouveauMotdepasse nomUsager={this.props.nomUsager} authUrl={this.props.authUrl} annuler={this.props.annuler} />

    return (
      <Form method="post" action={this.props.authUrl + "/inscrire"}>
        <Form.Control type="text" name="nom-usager" autoComplete="username"
          defaultValue={this.props.nomUsager} className="champ-cache" />
        <Form.Control type="hidden" name="type-authentification"
          value={this.state.typeAuthentification} />

        {optHiddenParams}

        <p>Creer un nouveau compte sur cette MilleGrille</p>
        <p>Usager : {this.props.nomUsager}</p>

        <Container className="boite-coinsronds boite-authentification">
          {subform}
        </Container>

      </Form>
    )
  }

}

class EnregistrerU2f extends React.Component {

  state = {
    u2fRegistrationJson: '',
    u2fReplyId: '',
  }

  inscrireU2f = event => {
    const {form} = event.currentTarget

    var params = '';
    if(this.props.nomUsager) {
      params = 'nom-usager=' + this.props.nomUsager
    }
    // console.debug("Params : %s", params)

    axios.post(this.props.authUrl + '/challengeRegistrationU2f', params)
    .then(reponse=>{
      const {registrationRequest, challengeId: u2fReplyId} = reponse.data
      solveRegistrationChallenge(registrationRequest)
      .then(credentials=>{
        const u2fRegistrationJson = JSON.stringify(credentials)
        this.setState({u2fRegistrationJson, u2fReplyId}, ()=>{
          form.submit()
        })
      })
      .catch(err=>{
        console.error("Erreur registration")
        console.error(err)
      })
    })
    .catch(err=>{
      console.error("Erreur requete challenge U2F")
      console.error(err)
    })
  }

  render() {
    return (
      <div>
        <Form.Control key="u2fReplyId" type="hidden"
            name="u2f-challenge-id" value={this.state.u2fReplyId} />

        <Form.Control key="u2fRegistrationJson" type="hidden"
            name="u2f-registration-json" value={this.state.u2fRegistrationJson} />

        <div>
          <p>
            Preparez votre cle de securite USB FIDO2/U2F, cliquez sur Inscrire et suivez les instructions a l'ecran.
          </p>
          <p>
            Si vous n'avez pas de cle USB FIDO2/U2F, vous pouvez utiliser un mot de passe (moins securitaire).
          </p>
        </div>

        <div className='button-list'>
          <Button onClick={this.inscrireU2f}>Inscrire</Button>
          <Button onClick={this.props.annuler} variant="secondary">Annuler</Button>
        </div>

      </div>
    )
  }

}

export class NouveauMotdepasse extends React.Component {

  state = {
    motdepasse: '',
    motdepasse2: '',
    motdepasseMatch: false,
    typeCompte: 'simple',

    motdepasseHash: '',
    motdepassePartiel: '',
    certMillegrillePEM: '',
    certIntermediairePEM: '',
  }

  changerMotdepasse = event => {
    const {value} = event.currentTarget

    const motdepasseMatch = value === this.state.motdepasse2;

    this.setState({
      motdepasse: value,
      motdepasseMatch,
    })

  }

  changerMotdepasse2 = event => {
    const {value} = event.currentTarget;
    const motdepasseMatch = value === this.state.motdepasse;
    this.setState({motdepasse2: value, motdepasseMatch})
  }

  changerTypeCompte = event => {
    const value = event.currentTarget.value
    this.setState({typeCompte: value})
  }

  inscrire = async event => {
    const {form} = event.currentTarget

    // Generer nouveau certificat de millegrille
    const {
      certMillegrillePEM,
      clePriveeMillegrilleChiffree,
      motdepasseCleMillegrille,
      certIntermediairePEM,
      motdepassePartiel,
    } = await genererNouveauCompte('/millegrilles/authentification/preparerInscription')

    const motdepasse = this.state.motdepasse
    var motdepasseHash = createHash('sha256').update(motdepasse, 'utf-8').digest('base64')

    console.debug("Cert millegrille")
    console.debug(certMillegrillePEM)
    console.debug("clePriveeMillegrilleChiffree")
    console.debug(clePriveeMillegrilleChiffree)
    console.debug("motdepasseCleMillegrille")
    console.debug(motdepasseCleMillegrille)
    console.debug("certIntermediairePEM")
    console.debug(certIntermediairePEM)
    console.debug("motdepassePartiel")
    console.debug(motdepassePartiel)

    this.setState({
      motdepassePartiel,
      certMillegrillePEM,
      certIntermediairePEM,
      motdepasseHash,
      motdepasse:'', motdepasse2:'', // Reset mot de passe (eviter de le transmettre en clair)
    }, ()=>{
      if(this.props.submit) {
        // Submit avec methode fournie - repackager event pour transmettre form
        this.props.submit({currentTarget: {form}})
      } else {
        form.submit()
      }
    })
  }

  render() {

    // name="" pour eviter de soumettre le mot de passe en clair
    return (
      <Container>
        <Form.Control key="motdepasseHash" type="hidden"
          name="motdepasse-hash" value={this.state.motdepasseHash} />
        <Form.Control key="motdepassePartiel" type="hidden"
          name="motdepasse-partiel" value={this.state.motdepassePartiel} />
        <Form.Control key="certMillegrillePEM" type="hidden"
          name="cert-millegrille-pem" value={this.state.certMillegrillePEM} />
        <Form.Control key="certIntermediairePEM" type="hidden"
          name="cert-intermediaire-pem" value={this.state.certIntermediairePEM} />

        <Form.Group controlId="formMotdepasse">
          <Form.Label>Nouveau mot de passe</Form.Label>
          <Form.Control
            type="password"
            className="motdepasse"
            name=""
            value={this.state.motdepasse}
            autoComplete="new-password"
            onChange={this.changerMotdepasse}
            placeholder="Nouveau mot de passe" />
        </Form.Group>

        <Form.Group controlId="formMotdepasse2">
          <Form.Control
            type="password"
            className="motdepasse"
            name=""
            value={this.state.motdepasse2}
            autoComplete="new-password"
            onChange={this.changerMotdepasse2}
            placeholder="Nouveau mot de passe" />
        </Form.Group>

        <fieldset>
          <Form.Group as={Row}>
            <Form.Label as="legend" column sm={5}>
              Type de compte
            </Form.Label>
            <Col sm={7}>
              <Form.Check
                type="radio"
                label="Simple gere via ce site web (valide 3 ans)"
                name="formTypeCompte"
                id="formTypeCompteSimple"
                value="simple"
                defaultChecked={this.state.typeCompte==='simple'}
                onChange={this.changerTypeCompte}
              />
              <Form.Check
                type="radio"
                label="Complet avec cle exportee (valide 10 ans)"
                name="formTypeCompte"
                id="formTypeCompteComplet"
                value="complet"
                defaultChecked={this.state.typeCompte==='complet'}
                onChange={this.changerTypeCompte}
              />
            </Col>
          </Form.Group>
        </fieldset>

        <Row><Col><hr /></Col></Row>

        <Row>

          <Col sm={5}>
            Securite 2 facteurs (recommande)
          </Col>

          <Col sm={7}>
            <Form.Group controlId="formU2F">
                <Form.Check type="checkbox" label="Utiliser cle de securite USB (e.g. FIDO2)" />
            </Form.Group>

            <Form.Group controlId="formGoogleAuthenticator">
                <Form.Check type="checkbox" label="Utiliser un code avec Google Authenticator" disabled={true}/>
            </Form.Group>
          </Col>

        </Row>

        <Row>
          <Col className="button-list">
            <Button onClick={this.inscrire}
              disabled={ ! this.state.motdepasseMatch }>Inscrire</Button>
            <Button onClick={this.props.annuler} variant="secondary">Annuler</Button>
          </Col>
        </Row>

      </Container>
    )
  }
}
