import React from 'react'
import { Form, Button, Row, Col, Alert } from 'react-bootstrap'
// import { solveLoginChallenge } from '@webauthn/client'
import { createHash } from 'crypto'
import base64url from 'base64url'
import multibase from 'multibase'
import { pki as forgePki } from 'node-forge'

import { repondreRegistrationChallenge } from '@dugrema/millegrilles.common/lib/browser/webauthn'
import { getClesPrivees } from '@dugrema/millegrilles.common/lib/browser/dbUsager'
import { getFingerprintPk } from '../components/pkiHelper'

import { ChargementClePrivee } from './ChargementCle'
import { RenderCSR } from './PemUtils'

export class AuthentifierWebauthn extends React.Component {

  state = {
    u2fReponseJson: '',
    activationDisponible: false,
    attenteReponse: false,
  }

  componentDidMount() {
    this.verifierActivationFingerprintPk()
  }

  async verifierActivationFingerprintPk() {
    const activationsDisponibles = this.props.infoCompteUsager.activationsDisponibles
    if(activationsDisponibles && activationsDisponibles.length > 0) {
      // Verifier si on affiche le bouton pour enregistrer une nouvelle methode
      const {csr, fingerprint_pk: fingerprintPk} = await getFingerprintPk(this.props.rootProps.nomUsager)
      console.debug("Verifier fingerprintPk %s, activations disponibles : %O", fingerprintPk, activationsDisponibles)

      const activationDisponible = activationsDisponibles.includes(fingerprintPk)
      this.setState({fingerprintPk, activationDisponible})
    }
  }

  authentifier = async event => {
    event.preventDefault()
    event.stopPropagation()

    const data = {
      nomUsager: this.props.nomUsager
    }

    // Effectuer la verification avec cle U2F puis soumettre
    const authRequest = this.props.infoCompteUsager.challengeWebauthn

    const challenge = multibase.decode(authRequest.challenge)
    var allowCredentials = authRequest.allowCredentials
    if(allowCredentials) {
      allowCredentials = allowCredentials.map(item=>{
        item.id = multibase.decode(item.id)
        return item
      })
    }
    console.debug("Challenge buffer : %O", challenge)

    const publicKey = {
      ...authRequest,
      challenge,
      allowCredentials,
    }
    console.debug("Prep publicKey : %O", publicKey)

    try {
      this.setState({attenteReponse: true})
      const publicKeyCredentialSignee = await navigator.credentials.get({publicKey})
      console.debug("PublicKeyCredential signee : %O", publicKeyCredentialSignee)

      const reponseSignee = publicKeyCredentialSignee.response

      const reponseEncodee = {
        id: publicKeyCredentialSignee.rawId,
        id64: String.fromCharCode.apply(null, multibase.encode('base64', new Uint8Array(publicKeyCredentialSignee.rawId))),
        response: {
          authenticatorData: String.fromCharCode.apply(null, multibase.encode('base64', new Uint8Array(reponseSignee.authenticatorData))),
          clientDataJSON: String.fromCharCode.apply(null, multibase.encode('base64', new Uint8Array(reponseSignee.clientDataJSON))),
          signature: String.fromCharCode.apply(null, multibase.encode('base64', new Uint8Array(reponseSignee.signature))),
          userHandle: String.fromCharCode.apply(null, multibase.encode('base64', new Uint8Array(reponseSignee.userHandle))),
        },
        type: publicKeyCredentialSignee.type,
      }
      console.debug("Reponse encodee : %O", reponseEncodee)

      data.webauthn = reponseEncodee

      // const credentials = await solveLoginChallenge(authRequest)
      // data.u2fAuthResponse = credentials

      await this.props.soumettreAuthentification(data)
    } catch(err) {
      console.error("Erreur challenge reply registration security key : %O", err)
    } finally {
      this.setState({attenteReponse: false})
    }

  }

  render() {

    // console.debug("!!! PROPPYS %O", this.props)
    const activationsDisponibles = this.props.infoCompteUsager
    const attenteReponse = this.state.attenteReponse || this.props.attenteReponse

    var registration = ''
    if(this.state.activationDisponible) {
      registration = (
        <RegisterWebAuthn disponible={this.state.activationDisponible}
                          fingerprintPk={this.state.fingerprintPk}
                          setRegistration={this.props.setRegistration}
                          rootProps={this.props.rootProps} />
      )
    }

    var labelSuivant = (
        <span>Suivant <i class="fa fa-arrow-circle-right"/></span>
      )
    if(attenteReponse) {
      labelSuivant = (
        <span>Suivant <i class="fa fa-spinner fa-spin fa-fw"/></span>
      )
    }

    return (
      <>
        <p>Si vous utilisez une cle de securite USB, veuillez l'inserer maintenant.</p>

        {registration}

        <Button onClick={this.authentifier} variant="primary" disabled={attenteReponse}>{labelSuivant}</Button>
        <Button onClick={this.props.annuler} variant="secondary">Annuler</Button>
      </>
    )
  }

}

class RegisterWebAuthn extends React.Component {

  state = {
    challenge: ''
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

  ajouterCred = async event => {

    // console.debug(desactiverAutres)

    const cw = this.props.rootProps.connexionWorker
    const challenge = this.state.challenge  // await cw.declencherAjoutWebauthn()
    console.debug("Challenge registration webauthn additionnelle : %O", challenge)
    // const reponseChallenge = await solveRegistrationChallenge(challenge.registrationRequest)
    // console.debug("Reponse au challenge U2F : %O", reponseChallenge)
    const nomUsager = this.props.rootProps.nomUsager
    const reponseChallenge = await repondreRegistrationChallenge(nomUsager, challenge, {DEBUG: true})

    const params = {
      reponseChallenge,
      fingerprintPk: this.props.fingerprintPk,
    }

    const resultatAjout = await cw.repondreChallengeRegistrationWebauthn(params)

    if(resultatAjout) {
      console.debug("OK ! Resultat ajout : %O", resultatAjout)

      // Trigger upgrade protege
      this.props.setRegistration()
    }
    else {
      console.error("Erreur ajout")
      // props.setAlerte({titre: 'Echec', contenu: 'Erreur ajout nouveau token U2F'})
    }

  }

  render() {
    if(!this.props.disponible) return ''

    return (
      <>
        <p>Enregistrez votre nouvel appareil en cliquant sur le bouton Nouveau.</p>
        <Button variant="secondary" onClick={this.ajouterCred} disabled={!this.state.challenge}>Nouveau</Button>
        <p>Ou utilisez une methode existante en cliquant sur Suivant.</p>
      </>
    )
  }
}

export class AuthentifierMotdepasse extends React.Component {

  state = {
    motdepasse: '',
  }

  changerChamp = event => {
    const {name, value} = event.currentTarget
    this.setState({[name]: value})
  }

  authentifier = async event => {
    event.preventDefault()
    event.stopPropagation()

    const data = {
      nomUsager: this.props.nomUsager,
      motdepasse: this.state.motdepasse,
    }

    // Effectuer la verification avec cle U2F puis soumettre
    try {
      await this.props.soumettreAuthentification(data)
    } catch(err) {
      console.error("Erreur mot de passe : %O", err)
    }

  }

  render() {
    return (
      <>
        <Form.Group controlId="formMotdepasse">
          <Form.Label>Mot de passe</Form.Label>
          <Form.Control
            type="password"
            name="motdepasse"
            value={this.state.motdepasse}
            autoComplete="current-password"
            onChange={this.changerChamp}
            placeholder="Saisir votre mot de passe" />
        </Form.Group>

        <Button onClick={this.authentifier} variant="primary">Suivant</Button>
        <Button onClick={this.props.annuler} variant="secondary">Annuler</Button>
      </>
    )
  }
}

export class AuthentifierTotp extends React.Component {

  state = {
    tokenTotp: ''
  }

  changerChamp = event => {
    const {name, value} = event.currentTarget
    this.setState({[name]: value})
  }

  authentifier = async event => {
    event.preventDefault()
    event.stopPropagation()

    const data = {
      nomUsager: this.props.nomUsager
    }

    // Effectuer la verification avec cle U2F puis soumettre
    try {
      data.tokenTotp = this.state.tokenTotp
      await this.props.soumettreAuthentification(data)
    } catch(err) {
      console.error("Erreur TOTP : %O", err)
    }

  }

  render() {
    return (
      <>
        <Form.Group controlId="formTokenTotp">
          <Form.Label>Token TOTP</Form.Label>
          <Form.Control
            type="text"
            name="tokenTotp"
            value={this.state.tokenTotp}
            onChange={this.changerChamp}
            placeholder="123456" />
        </Form.Group>

        <Button onClick={this.authentifier} variant="primary">Suivant</Button>
        <Button onClick={this.props.annuler} variant="secondary">Annuler</Button>
      </>
    )
  }
}

export class AuthentifierCertificatMillegrille extends React.Component {

  state = {
    reponseCertificat: ''
  }

  componentDidMount() {
    console.debug("AuthentifierCertificatMillegrille proppys: %O", this.props)
  }

  authentifier = async event => {
    event.preventDefault()
    event.stopPropagation()

    const data = {
      nomUsager: this.props.nomUsager,
      cleMillegrille: this.state.reponseCertificat
    }

    // Effectuer la verification avec cle U2F puis soumettre
    try {
      await this.props.soumettreAuthentification(data)
    } catch(err) {
      console.error("Erreur TOTP : %O", err)
    }

  }

  signerMessage = async cle => {
    console.debug("Conserver cle de millegrille : %O", cle)

    const webWorker = this.props.rootProps.webWorker
    await webWorker.chargerCleMillegrilleSubtle(cle)
    console.debug("Cle de millegrille chargee")

    console.debug("Signer le message")
    const challengeCertificat = this.props.infoCompteUsager.challengeCertificat
    var reponseCertificat = {
      ...challengeCertificat,
    }
    const signature = await webWorker.signerMessageCleMillegrille(reponseCertificat)
    reponseCertificat['_signature'] = signature
    this.setState({reponseCertificat}, _=>{console.debug("State apres signature cert : %O", this.state)})
  }

  render() {
    return (
      <>
        <ChargementClePrivee challengeCertificat={this.props.challengeCertificat}
                             conserverCle={this.signerMessage} />

        <Button onClick={this.authentifier} variant="primary">Suivant</Button>
        <Button onClick={this.props.annuler} variant="secondary">Annuler</Button>
      </>
    )
  }
}

export class AuthentifierCertificat extends React.Component {

  state = {
    reponseCertificat: ''
  }

  setReponseCertificat = signature => {
    const reponseCertificat = {...this.props.challengeCertificat, '_signature': signature}
    this.setState({reponseCertificat}, _=>{console.debug("State apres signature cert : %O", this.state)})
  }

  authentifier = async event => {
    event.preventDefault()
    event.stopPropagation()

    const nomUsager = this.props.nomUsager
    console.debug("Challenge certificat :\n%O", this.props.challengeCertificat)
    //this.setState({debugInfo: this.state.debugInfo + '\n' + 'Generer reponse challenge certificat pour usager ' + nomUsager})
    try {
      const cles = await getClesPrivees(nomUsager)

      console.debug("Cles privees %O", cles)
      const reponseCertificat = await this.props.rootProps.webWorker.formatterMessage(
        this.props.challengeCertificat, 'login', {attacherCertificat: true})
      // const reponseCertificatJson = stringify(reponseCertificat)

      const data = {
        nomUsager: this.props.nomUsager,
        certificatFullchainPem: this.state.fullchainNavigateur,
        reponseCertificat: reponseCertificat,
      }

      await this.props.soumettreAuthentification(data)
    } catch(err) {
      console.error("Erreur TOTP : %O", err)
    }

  }

  render() {
    return (
      <>
        <p>Cliquez sur suivant.</p>

        <Button onClick={this.authentifier} variant="primary">Suivant</Button>
        <Button onClick={this.props.annuler} variant="secondary">Annuler</Button>
      </>
    )
  }
}

export class AuthentifierCsr extends React.Component {

  state = {
    // csrForge: '',
    // nomUsager: '',
    err: '',
  }

  componentDidMount() {
    this.loadCsr()
  }

  async loadCsr() {
    console.debug("Charger CSR : %O", this.props.csr)
    try {
      const csrForge = forgePki.certificationRequestFromPem(this.props.csr)
      console.debug("CSR Forge : %O", csrForge)
      const nomUsager = csrForge.subject.getField('CN').value
      this.setState({csrForge, nomUsager}, _=>{console.debug("State csr : %O", this.state)})
    } catch(err) {
      console.error("Erreur chargement csr : %O", err)
      this.setState({err})
    }
  }

  authentifier = async event => {
    event.preventDefault()
    event.stopPropagation()
  }

  render() {
    var detailErreur = ''
    if(this.err) {
      detailErreur = <pre>{this.err.stack}</pre>
    }

    return (
      <>
        <Alert variant="danger" show={this.err?true:false}>
          <Alert.Heading>Erreur</Alert.Heading>
          <p>{''+this.err}</p>
          {detailErreur}
        </Alert>

        <p>
          Vous pouvez scanner ce code a partir de MilleGrille sur un autre
          appareil mobile qui a deja acces a votre compte.
        </p>

        <Row>
          <Col>
            <RenderCSR csr={this.props.csr} />
          </Col>
        </Row>

        <p>
          Cliquez sur suivant apres avoir recu la confirmation d'activation
          du code.
        </p>

        <Row>
          <Col>
            <Button onClick={this.authentifier} variant="primary">Suivant</Button>
            <Button onClick={this.props.annuler} variant="secondary">Annuler</Button>
          </Col>
        </Row>
      </>
    )
  }
}
