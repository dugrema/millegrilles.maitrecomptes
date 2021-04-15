import React from 'react'
import { Modal, Alert } from 'react-bootstrap'
import {
  initialiserNavigateur,
} from '../components/pkiHelper'
import { AuthentifierUsager } from './Authentification'

export function ModalAuthentification(props) {

  return (
    <Modal show={props.show} onHide={props.fermer}>
      <Modal.Header closeButton>
        <Modal.Title>Authentifier en mode protege</Modal.Title>
      </Modal.Header>

      <Modal.Body>
        <ChargementInfoAuth2FA {...props} />
      </Modal.Body>
    </Modal>
  )

}

class ChargementInfoAuth2FA extends React.Component {

  state = {
    infoCharge: false,
    refuse: false,
    reussi: true,
    err: '',
  }

  componentDidMount() {
    console.debug("!!! CHARGER INFO USAGER")
    this.chargerInformationUsager()
  }

  async chargerInformationUsager() {
    const nomUsager = this.props.nomUsager

    const data = {
      nomUsager
    }

    // Verifier et valider chaine de certificat/cle local si presentes
    const infoCertNavigateur = await initialiserNavigateur(nomUsager)
    if(infoCertNavigateur && infoCertNavigateur.certificatValide) {
      data.certificatNavigateur = infoCertNavigateur
    } else {
      console.debug("Navigateur, certificat absent ou invalide : %O", infoCertNavigateur)
    }

    // Utiliser socket.io pour obtenir l'information de l'usager
    const cw = this.props.rootProps.connexionWorker
    const response = await cw.genererChallengeWebAuthn(data)
    console.debug("Response genererChallengeWebAuthn : %O", response)

    if(!response) {
      throw new Error("Erreur acces reponse")
    }

    if(response.authentificationPrimaire === 'clemillegrille') {
      // L'authentification a ete faite avec la cle de millegrille, on n'a
      // pas besoin de 2e facteur.
      return this.soumettreAuthentification({nomUsager})
    }

    // Retirer methode primaire
    switch(response.authentificationPrimaire) {
      case 'webauthn': delete response.challengWebauthn; break
      case 'totp': delete response.totpDisponible; break
      case 'motdepasse': delete response.motdepasseDisponible; break
      default: break
    }
    // if(response.authentificationPrimaire === 'u2f') {
    //   delete response.challengeU2f
    // } else if(response.authentificationPrimaire === 'totp') {
    //   delete response.totpDisponible
    // } else if(response.authentificationPrimaire === 'motdepasse') {
    //   delete response.motdepasseDisponible
    // }

    const update = {
      etatUsager: 'connu',
      usagerVerifie: true,
      nomUsager,
      ...response
    }

    this.setState({...update}, _=>{console.debug("chargerInformationUsager: Auth state : %O", this.state)})
  }

  setRegistration = valide => {
    const reussi = valide
    this.setState({refuse: '', reussi, err: ''})
    // this.props.fermer()
    this.soumettreAuthentification()
    // this.props.setModeProtege()
  }

  setUsagerAuthentifie = () => {
    console.debug("Auth 2FA reussi, activation du mode protege")
    this.props.setModeProtege()
  }

  soumettreAuthentification = async (data, opts) => {
    if(!opts) opts = {}

    var reussi = false, refuse = false, _err = null

    this.setState({refuse: false})
    console.debug("Upgrade protege, authentifier 2FA : %O, props: %O", data, this.props)
    try {

      const {connexionWorker: cw} = this.props.rootProps
      const formatteurReady = await cw.isFormatteurReady()
      console.debug('Formatteur ready %s', formatteurReady)
      // if(formatteurReady) {
      //   console.debug("Auto-upgrade protege en cours")
      //   // On a deja un certificat valide, l'utiliser pour auto-login
      //   const resultat = await cw.upgradeProteger(data)
      //   console.debug("!!! AUTO UPGRADE result : %O", resultat)
      //   if(resultat) {
      //     // Auto-login reussi
      //     reussi = true
      //     this.props.fermer()
      //   }
      //   return reussi
      // } else {
      //   console.warn("Formatteur non pret")
      // }

      const resultat = await cw.upgradeProteger(data)
      console.debug("Resultat upgrade proteger : %O", resultat)
      if(resultat) {
        reussi = true
        this.props.fermer()
      } else if(data && !data.reponseCertificat) {  // Ignorer pour autologin
        if(!opts.noerror) {
          refuse = true
        }
      }
    } catch(err) {
      console.error("Erreur : %O", err)
      if(!opts.noerror) {
        refuse = true
        _err = err
      }
    } finally {
      this.setState({refuse, reussi, err: _err})
    }

    return reussi
  }

  setErreur = err => {
    this.setState({err})
  }

  render() {

    var erreur = ''
    if(this.state.refuse) {
      erreur = (
        <Alert variant='danger'>
          <Alert.Heading>Acces refuse</Alert.Heading>
          {''+this.state.err}
        </Alert>
      )
    }

    if(this.state.usagerVerifie) {
      return (
        <>
          {erreur}
          <AuthentifierUsager {...this.props} {...this.state}
            annuler={this.props.fermer}
            infoCompteUsager={this.state}
            soumettreAuthentification={this.soumettreAuthentification}
            setRegistration={this.setRegistration}
            setErreur={this.setErreur}
            setUsagerAuthentifie={this.setUsagerAuthentifie} />
        </>
      )
    } else {
      return <p>Chargement en cours</p>
    }
  }

}
