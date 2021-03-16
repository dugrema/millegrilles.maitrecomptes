import React from 'react'
import {Container, Form, Row, Col, Button, Alert} from 'react-bootstrap'
import axios from 'axios'
import stringify from 'json-stable-stringify'
import { solveRegistrationChallenge } from '@webauthn/client'
import { createHash } from 'crypto'

import { initialiserNavigateur } from '../components/pkiHelper'

export class InscrireUsager extends React.Component {

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

    return (
      <Form method="post" action={this.props.authUrl + "/ouvrir"}>
        <Form.Control type="text" name="nom-usager" autoComplete="username"
          defaultValue={this.props.nomUsager} className="champ-cache" />
        <Form.Control type="hidden" name="type-authentification"
          value={this.state.typeAuthentification} />

        {optHiddenParams}

        <h2>Créer un nouveau compte</h2>

        <div className="boite-coinsronds boite-authentification">
          <Confirmation nomUsager={this.props.nomUsager}
                        authUrl={this.props.authUrl}
                        annuler={this.props.annuler} />
        </div>

      </Form>
    )
  }

}

export class Confirmation extends React.Component {

  state = {
    pasEuropeen: false,
  }

  checkboxToggle = event => {
    const name = event.currentTarget.name
    this.setState({[name]: !this.state[name]})
  }

  inscrire = async event => {
    console.debug("Proppys!!! %O", this.props)
    const requetePreparation = {nomUsager: this.props.nomUsager}
    const {csr} = await initialiserNavigateur(this.props.nomUsager)

    console.debug("CSR navigateur\n%O", csr)

    // // Generer nouveau certificat de millegrille
    // const reponsePreparation = await genererNouveauCompte(this.props.authUrl + '/preparerInscription', requetePreparation)
    // const {
    //   certMillegrillePEM,
    //   certIntermediairePEM,
    //   challengeCertificat,
    // } = reponsePreparation
    //
    // var motdepasseHash = createHash('sha256').update(this.state.motdepasse, 'utf-8').digest('base64').replace(/=/g, '')

    const requeteInscription = {
      nomUsager: this.props.nomUsager,
      csr,
    }

    console.debug("Requete inscription : %O", requeteInscription)

    try {
      const reponseInscription = await axios.post(this.props.authUrl + '/inscrire', requeteInscription)
      console.debug("Reponse inscription : %O", reponseInscription)
    } catch(err) {
      console.error("Erreur inscription : %O", err)
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
    //
    // console.debug("Challenge certificat :\n%O", challengeCertificat)
    // const reponseCertificat = await this.props.rootProps.webWorker.formatterMessage(
    //   this.props.challengeCertificat, 'login', {attacherCertificat: true})
    // const reponseCertificatJson = stringify(reponseCertificat)
    //
    // console.debug("Requete inscription")
    // console.debug(requeteInscription)
    //
    // const reponseInscription = await axios.post(this.props.authUrl + '/inscrire', requeteInscription)
    // console.debug("Reponse inscription")
    // console.debug(reponseInscription.data)
    //
    // const { certificat: certificatNavigateur, fullchain: fullchainNavigateur } = reponseInscription.data
    // await sauvegarderCertificatPem(this.props.nomUsager, certificatNavigateur, fullchainNavigateur)
    //
    // if(reponseInscription.status === 201) {
    //   console.debug("Inscription completee avec succes :\n%O", reponseInscription.data)
    //
    //   // Sauvegarder info dans local storage pour ce compte
    //
    //   this.setState({
    //     motdepasseHash,
    //     fullchainNavigateur,
    //     reponseCertificatJson,
    //     motdepasse:'', motdepasse2:'', // Reset mot de passe (eviter de le transmettre en clair)
    //   }, ()=>{
    //     if(this.props.submit) {
    //       // Submit avec methode fournie - repackager event pour transmettre form
    //       this.props.submit({currentTarget: {form}})
    //     } else {
    //       console.debug("PRE-SUBMIT state :\n%O", this.state)
    //       form.submit()
    //     }
    //   })
    //
    // } else {
    //   console.error("Erreur inscription usager : %d", reponseInscription.status)
    // }

  }

  render() {

    // name="" pour eviter de soumettre le mot de passe en clair
    return (
      <Container>
        <Form.Control key="reponseCertificatJson" type="hidden"
            name="certificat-reponse-json" value={this.state.reponseCertificatJson} />

        <p>Le compte {this.props.nomUsager} est disponible.</p>

        <p>Pour le créer, veuillez cliquer sur le bouton Inscrire</p>

        <Alert variant="warning">
          <Alert.Heading>Note pour les européens</Alert.Heading>
          MilleGrilles utilise des biscuits témoins de monstruosités et autres
          trucs encore pires.
        </Alert>

        <Form.Group controlId="formEuropeen">
            <Form.Check type="checkbox" name="pasEuropeen"
                        onClick={this.checkboxToggle}
                        value={this.state.pasEuropeen}
                        label="Je ne suis pas européen" />
        </Form.Group>

        <Row>
          <Col className="button-list">
            <Button onClick={this.inscrire}
              disabled={ ! this.state.pasEuropeen }>Inscrire</Button>
            <Button onClick={this.props.annuler} variant="secondary">Annuler</Button>
          </Col>
        </Row>

      </Container>
    )
  }
}
