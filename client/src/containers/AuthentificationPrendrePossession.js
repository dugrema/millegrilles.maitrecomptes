import React from 'react'
import {Container, Button, Alert} from 'react-bootstrap'
import axios from 'axios'
// import multibase from 'multibase'
// import base64url from 'base64url'
// import { solveRegistrationChallenge } from '@webauthn/client'
import { repondreRegistrationChallenge } from '@dugrema/millegrilles.common/lib/browser/webauthn'

export class PrendrePossession extends React.Component {

  state = {
    u2fRegistrationJson: '',
    challengeId: '',
    err: '',
  }

  actionPrendrePossession = async event => {
    event.preventDefault()
    event.stopPropagation()

    console.debug("Submit prendre possession")
    const params = {
      nomUsager: 'proprietaire'
    }

    const reponse = await axios.post(this.props.authUrl + '/challengeRegistration', params)
    console.debug("Reponse U2F challenge")
    console.debug(reponse)
    const attestationChallenge = reponse.data.challenge

    // // Parse options, remplacer base64 par buffer
    // const challenge = multibase.decode(attestationChallenge.challenge)
    // const userId = multibase.decode(attestationChallenge.user.id)
    // const publicKey = {
    //   ...attestationChallenge,
    //   challenge,
    //   user: {
    //     ...attestationChallenge.user,
    //     id: userId,
    //     name: 'proprietaire',
    //     displayName: 'proprietaire',
    //   }
    // }
    // console.debug("Registration options avec buffers : %O", publicKey)

    try {
      // const newCredential = await navigator.credentials.create({publicKey})
      // console.debug("New credential : %O", newCredential)
      //
      // // Transmettre reponse
      // const credentialResponse = newCredential.response
      // const jsonData = base64url.encode(credentialResponse.clientDataJSON)
      // const attestationObject = base64url.encode(new Uint8Array(credentialResponse.attestationObject))
      // const data = {
      //   id: newCredential.id,
      //   response: {
      //     attestationObject,
      //     clientDataJSON: jsonData,
      //   }
      // }

      const data = await repondreRegistrationChallenge('proprietaire', attestationChallenge, {DEBUG: true})

      console.debug("Transmettre reponse registration : %O", data)
      const reponseRegistration = await axios.post(this.props.authUrl + '/prendrePossession', data)
      console.debug("Reponse registration : %O", reponseRegistration)

      // Faire un reload sur la page pour activer la nouvelle session
      window.location.reload()

    } catch(err) {
      console.error("Erreur registration : %O", err)
      this.setState({err})
    }

  }

  render() {
    return (
      <Container>
        <AlertMessage erreur={this.state.err} />

        <h1>Nouvelle MilleGrille</h1>

        <p>Ceci est une nouvelle MilleGrille sans proprietaire.</p>

        <p>IDMG : {this.props.idmg}</p>

        <p>
          Pour prendre possession de la MilleGrille, cliquez sur le bouton Prendre Possession.
          L'operation va creer un nouveau compte de proprietaire et associer le compte a
          votre appareil ou navigateur.
        </p>

        <Alert variant="warning">
          <Alert.Heading>Compte proprietaire</Alert.Heading>
          Un compte proprietaire permet d'administrer la MilleGrille. Il est
          de votre responsabilite de garder votre methode d'authentification en
          securite et de vous assurer d'avoir une methode secondaire si jamais
          vous perdez votre methode principale.
        </Alert>

        <Alert variant="info">
          <Alert.Heading>Methodes d'authentification</Alert.Heading>
          <p>
          La prise de possession fonctionne uniquement avec des facteurs
          d'authentification forts (public key avec webauthn).
          </p>

          <p>Par exemple :</p>
          <ul>
            <li>un lecteur d'empreinte digitale sur votre appareil mobile</li>
            <li>Windows Hello (inclus avec Windows 10)</li>
            <li>une cle de securite FIDO2 (e.g. Yubikey)</li>
          </ul>
        </Alert>

        <Button onClick={this.actionPrendrePossession}>Prendre possession</Button>
      </Container>
    )
  }

}

function AlertMessage(props) {
  var afficher = props.erreur?true:false
  var stack = ''
  if(props.erreur) {
    stack = props.erreur.stack
  }
  return (
    <Alert show={afficher} variant="danger">
      <Alert.Heading>Erreur</Alert.Heading>
      <p>{''+props.erreur}</p>
      <pre>{stack}</pre>
    </Alert>
  )
}
