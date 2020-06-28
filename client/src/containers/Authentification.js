import React from 'react'
import {Button, Form, Container, Row, Col, Nav, Alert} from 'react-bootstrap'
import axios from 'axios'
import {createHash} from 'crypto'
import {solveRegistrationChallenge, solveLoginChallenge} from '@webauthn/client'
import { Trans } from 'react-i18next'
import { v4 as uuidv4 } from 'uuid'
import {signerContenuString, chargerClePrivee, enveloppePEMPrivee, enveloppePEMPublique, chargerClePubliquePEM } from 'millegrilles.common/lib/forgecommon'
import { genererCsrNavigateur } from 'millegrilles.common/lib/cryptoForge'
import { openDB, deleteDB, wrap, unwrap } from 'idb';

import stringify from 'json-stable-stringify'

import { PkiInscrire, validerChaineCertificats } from './Pki'
import {
  genererNouveauCertificatMilleGrille,
  preparerInscription,
  genererNouveauCompte,
  genererMotdepassePartiel
} from '../components/pkiHelper'

import { CryptageAsymetrique } from 'millegrilles.common/lib/cryptoSubtle'

const CHARS_SUPPORTES_NOM = 'abcdefghijklmnopqrstuvwxyz0123456789-_.@'

export class Authentifier extends React.Component {

  state = {
    infoCharge: false,  // True lorsque l'appel de chargerInformationAuthentification() est autoComplete
    nomUsager: localStorage.getItem('usager') || '',
    attendreVerificationUsager: false,

    etatUsager: '',
    authRequest: '',
    challengeId: '',
    // motdepassePresent: false,
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
        const nomUsagerServeur = this.state.nomUsager + '@' + window.location.hostname
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
          erreurMotdepasse={this.props.erreurMotdepasse}
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
            // motdepassePresent={this.state.motdepassePresent}
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

        <Container className="form-login">
          <Row>
            <Col>
              <p><Trans>authentification.accesProprietaire</Trans></p>
              <Form method="POST" onSubmit={this.props.boutonOuvrirProprietaire} action={this.props.authUrl + '/ouvrirProprietaire'}>
                <Form.Control key="redirectUrl" type="hidden"
                  name="url" value={this.props.redirectUrl} />
                <Form.Control key="u2fClientJson" type="hidden"
                  name="u2f-client-json" value={this.props.u2fAuthRequest} />
                <Form.Control key="u2fChallengeId" type="hidden"
                  name="u2f-challenge-id" value={this.props.challengeId} />
                <Button type="submit" variant="success"><Trans>bouton.accesProprietaire</Trans></Button>
              </Form>
            </Col>
          </Row>

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

                <Button type="submit" disabled={!this.props.nomUsager} variant="dark">Suivant</Button>
              </Form>
            </Col>
          </Row>

        </Container>
      </div>
    )
  }
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
    typeAuthentification: 'u2f',
    motdepasse: '',

    certNavigateurHachage: '',
    motdepassePartiel: '',

    motdepasseHash: '',
    u2fClientJson: '',
  }

  // Generer ou regenerer le certificat de navigateur
  async genererCertificatNavigateur() {
    const requetePreparation = {
      nomUsager: this.props.nomUsager,
      motdepasseHash: this.state.motdepasseHash,
    }

    // Generer nouveau certificat de millegrille
    const motdepassePartiel = genererMotdepassePartiel()

    const requeteGenerationCertificat = {
      'nom-usager': this.props.nomUsager,
      'motdepasse-hash': this.state.motdepasseHash,
      'motdepassePartielClient': motdepassePartiel,
    }

    // if(this.state.u2f) {
    //   // Verifier qu'on a recu le challenge U2F, generer la reponse
    //   const challengeU2f = reponsePreparation.u2fRegistrationRequest
    //   console.debug("Challenge U2F")
    //   console.debug(challengeU2f)
    //
    //   const credentials = await solveRegistrationChallenge(challengeU2f)
    //   requeteInscription.u2fRegistrationJson = credentials
    // }

    console.debug("Requete generation certificat navigateur")
    console.debug(requeteGenerationCertificat)

    const reponseCertificatNavigateur = await axios.post(this.props.authUrl + '/preparerCertificatNavigateur', requeteGenerationCertificat)
    console.debug("Reponse certificat navigateur")
    console.debug(reponseCertificatNavigateur.data)

    if(reponseCertificatNavigateur.status === 201) {
      console.debug("Creation certificat complete avec succes")
      const fingerprintNavigateur = reponseCertificatNavigateur.data.fingerprintNavigateur

      // Sauvegarder info dans local storage pour ce compte
      const localStorageNavigateur = {
        fingerprint: fingerprintNavigateur,
        motdepassePartiel,
      }
      localStorage.setItem('compte.' + this.props.nomUsager, JSON.stringify(localStorageNavigateur))

      await new Promise((resolve, reject)=>{
        this.setState({
          motdepassePartiel,
          certNavigateurHachage: fingerprintNavigateur,
          motdepasse:'', motdepasse2:'', // Reset mot de passe (eviter de le transmettre en clair)
        }, ()=>resolve())
      })

    } else {
      console.error("Erreur inscription usager : %d", reponseCertificatNavigateur.status)
    }

  }

  componentDidMount() {
    var defaultKey = null;
    if(this.props.u2fAuthRequest) {
      defaultKey = 'u2f'
    } else {
      defaultKey = 'motdepasse'
    }

    initialiserNavigateur()

    const infoCertNavigateur = JSON.parse(localStorage.getItem('compte.' + this.props.nomUsager) || '{}')

    this.setState({
      typeAuthentification: defaultKey,
      certNavigateurHachage: infoCertNavigateur.fingerprint || '',
      motdepassePartiel: infoCertNavigateur.motdepassePartiel || '',
    }, ()=>{console.debug(this.state)})
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
      var motdepasseHash = createHash('sha256').update(this.state.motdepasse, 'utf-8').digest('base64').replace(/=/g, '')
      this.setState({
        motdepasse: '', // Reset mot de passe (eviter de le transmettre en clair)
        motdepasseHash,
      }, async ()=>{

        try {
          if( ! this.state.motdepassePartiel ) {
            // Generer nouveau certificat de navigateur
            await this.genererCertificatNavigateur()
          }

          form.submit()
        } catch (err) {
          console.error("Erreur generation certificat")
          console.error(err)
        }
      })
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
    }

    return (
      <Form method="post" onSubmit={this.authentifier} action={this.props.authUrl + "/ouvrir"}>

        <Form.Control type="text" name="nom-usager" autoComplete="username"
          defaultValue={this.props.nomUsager} className="champ-cache"/>
        <Form.Control type="hidden" name="motdepasse-hash"
          value={this.state.motdepasseHash} />
        <Form.Control key="motdepassePartiel" type="hidden"
          name="motdepasse-partiel" value={this.state.motdepassePartiel} />
        <Form.Control key="certNavigateurHachage" type="hidden"
          name="cert-navigateur-hash" value={this.state.certNavigateurHachage} />

        <p>Usager : {this.props.nomUsager}</p>

        <Nav variant="tabs" activeKey={this.state.typeAuthentification} onSelect={this.changerTypeAuthentification}>
          <Nav.Item>
            <Nav.Link eventKey="u2f" disabled={!this.props.u2fAuthRequest}>U2F</Nav.Link>
          </Nav.Item>
          <Nav.Item>
            <Nav.Link eventKey="motdepasse">Mot de passe</Nav.Link>
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
    typeAuthentification: 'password',
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
      <Form method="post" action={this.props.authUrl + "/ouvrir"}>
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
    certNavigateurHachage: '',

    u2f: false,
    googleauth: false,

    u2fRegistrationJson: '',
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

  checkboxToggle = event => {
    const name = event.currentTarget.name
    this.setState({[name]: !this.state[name]})
  }

  inscrire = async event => {
    const {form} = event.currentTarget

    const requetePreparation = {nomUsager: this.props.nomUsager}
    if(this.state.u2f) {
      requetePreparation.u2f = true
    }

    // Generer nouveau certificat de millegrille
    const reponsePreparation = await genererNouveauCompte(this.props.authUrl + '/preparerInscription', requetePreparation)
    const {
      certMillegrillePEM,
      clePriveeMillegrilleChiffree,
      motdepasseCleMillegrille,
      certIntermediairePEM,
      motdepassePartiel,
    } = reponsePreparation

    const motdepasse = this.state.motdepasse
    var motdepasseHash = createHash('sha256').update(this.state.motdepasse, 'utf-8').digest('base64').replace(/=/g, '')

    const requeteInscription = {
      usager: this.props.nomUsager,
      certMillegrillePEM,
      certIntermediairePEM,
      motdepassePartielClient: motdepassePartiel,
      motdepasseHash,
    }

    if(this.state.u2f) {
      // Verifier qu'on a recu le challenge U2F, generer la reponse
      const challengeU2f = reponsePreparation.u2fRegistrationRequest
      console.debug("Challenge U2F")
      console.debug(challengeU2f)

      const credentials = await solveRegistrationChallenge(challengeU2f)
      requeteInscription.u2fRegistrationJson = credentials
    }

    console.debug("Requete inscription")
    console.debug(requeteInscription)

    const reponseInscription = await axios.post(this.props.authUrl + '/inscrire', requeteInscription)
    console.debug("Reponse inscription")
    console.debug(reponseInscription.data)

    if(reponseInscription.status === 201) {
      console.debug("Inscription completee avec succes")
      const fingerprintNavigateur = reponseInscription.data.fingerprintNavigateur

      // Sauvegarder info dans local storage pour ce compte
      const localStorageNavigateur = {
        fingerprint: fingerprintNavigateur,
        motdepassePartiel,
      }
      localStorage.setItem('compte.' + this.props.nomUsager, JSON.stringify(localStorageNavigateur))

      this.setState({
        motdepassePartiel,
        motdepasseHash,
        certNavigateurHachage: fingerprintNavigateur,
        motdepasse:'', motdepasse2:'', // Reset mot de passe (eviter de le transmettre en clair)
      }, ()=>{
        if(this.props.submit) {
          // Submit avec methode fournie - repackager event pour transmettre form
          this.props.submit({currentTarget: {form}})
        } else {
          form.submit()
        }
      })

    } else {
      console.error("Erreur inscription usager : %d", reponseInscription.status)
    }

  }

  render() {

    // name="" pour eviter de soumettre le mot de passe en clair
    return (
      <Container>
        <Form.Control key="motdepasseHash" type="hidden"
          name="motdepasse-hash" value={this.state.motdepasseHash} />
        <Form.Control key="motdepassePartiel" type="hidden"
          name="motdepasse-partiel" value={this.state.motdepassePartiel} />
        <Form.Control key="certNavigateurHachage" type="hidden"
          name="cert-navigateur-hash" value={this.state.certNavigateurHachage} />
        <Form.Control key="u2fRegistrationJson" type="hidden"
            name="u2f-registration-json" value={this.state.u2fRegistrationJson} />

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

        <fieldset>
          <Row>

            <Col sm={5}>
              Securite 2 facteurs (recommande)
            </Col>

            <Col sm={7}>
              <Form.Group controlId="formU2F">
                  <Form.Check type="checkbox" name="u2f" onClick={this.checkboxToggle} value={this.state.u2f} label="Utiliser cle de securite USB (e.g. FIDO2)" />
              </Form.Group>

              <Form.Group controlId="formGoogleAuthenticator">
                  <Form.Check type="checkbox" name="googleauth" onClick={this.checkboxToggle} value={this.state.googleauth} label="Utiliser un code avec Google Authenticator" disabled={true}/>
              </Form.Group>
            </Col>

          </Row>
        </fieldset>

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

// Initialiser le contenu du navigateur
async function initialiserNavigateur(domain) {

  const db = openDB('millegrilles-store', 1, {
    upgrade(db) {
      db.createObjectStore('cles');
    },
  });

  // console.debug("Database %O", db)
  const tx = (await db).transaction('cles', 'readwrite');
  const store = (await tx).objectStore('cles');
  const val = (await store.get('disBonjour'));
  await tx.done;

  if(!val) {
    console.debug("Pas stocke")
    // Generer nouveau keypair et stocker
    const keypair = await new CryptageAsymetrique().genererKeysNavigateur()
    console.debug("Key pair : %O", keypair)

    const clePriveePem = enveloppePEMPrivee(keypair.clePriveePkcs8),
          clePubliquePem = enveloppePEMPublique(keypair.clePubliqueSpki)
    console.debug("Cles :\n%s\n%s", clePriveePem, clePubliquePem)

    const clePriveeForge = chargerClePrivee(clePriveePem),
          clePubliqueForge = chargerClePubliquePEM(clePubliquePem)

    // console.debug("CSR Genere : %O", resultat)
    const csrNavigateur = await genererCsrNavigateur('idmg', 'nomUsager', clePubliqueForge, clePriveeForge)

    console.debug("CSR Navigateur :\n%s", csrNavigateur)

    const txPut = (await db).transaction('cles', 'readwrite');
    const storePut = (await txPut).objectStore('cles');
    await Promise.all([
      storePut.put(keypair.clePriveeDecrypt, 'dechiffrer'),
      storePut.put(keypair.clePriveeSigner, 'signer'),
      storePut.put(keypair.clePublique, 'public'),
      storePut.put(csrNavigateur, 'csr'),
      txPut.done,
    ])
  }

}
