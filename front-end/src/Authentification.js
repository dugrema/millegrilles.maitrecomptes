import React from 'react'
import {Button, Form, Container, Row, Col, Nav} from 'react-bootstrap'
import axios from 'axios'
import {createHash} from 'crypto'
import {solveRegistrationChallenge, solveLoginChallenge} from '@webauthn/client'

export class Authentifier extends React.Component {

  state = {
    nomUsager: '',
    attendreVerificationUsager: false,
    usagerVerifie: false,
    etatUsager: '',
    u2fAuthRequest: '',
  }

  componentDidMount() {
    console.debug("Chargement component")

    // Verifier si on a un nom d'usager dans local storage
    axios.get('/authentification/verifier')
    .then(reponse =>{
      console.debug("Reponse verification cookie session")
      console.debug(reponse)

      // Conserver le nom de l'usager, redirige vers la liste des applications disponibles
      const nomUsager = reponse.headers['user-prive']
      this.props.setNomUsagerAuthentifie(nomUsager)
    })
    .catch(err=>{
      if(err.response) {
        const statusCode = err.response.status
        if(statusCode === 401) {
          console.debug("Usager non authentifie")
        } else {
          console.error("Erreur verification cookie session, status code %s", statusCode)
          console.error(err)
        }
      } else {
        console.error("Erreur connexion serveur")
        console.error(err)
      }
    })
  }

  boutonUsagerSuivant = (event) => {
    console.debug("Authentifier")
    this.setState({usagerVerifie: true})  // TODO: Faire une vraie verif

    axios.post('/authentification/verifierUsager', 'nom-usager='+this.state.nomUsager)
    .then(response=>{
      console.debug(response)

      const update = {
        etatUsager: 'connu'
      }
      if(response.data.authRequest) {
        update.u2fAuthRequest = response.data.authRequest
      }

      this.setState(update)
    })
    .catch(err=>{
      const statusCode = err.response.status
      if(statusCode === 401) {
        console.debug("Usager inconnu")
        this.setState({etatUsager: 'inconnu'})
      } else {
        console.error("Erreur verification usager")
        console.error(err);
      }
    })

  }

  changerNomUsager = (event) => {
    const {value} = event.currentTarget
    this.setState({nomUsager: value})
  }

  render() {

    let formulaire;
    if(!this.state.usagerVerifie) {
      formulaire =
        <SaisirUsager
          boutonUsagerSuivant={this.boutonUsagerSuivant}
          changerNomUsager={this.changerNomUsager}
          nomUsager={this.state.nomUsager} />
    } else {
      if(this.state.etatUsager === 'connu') {
        formulaire =
          <AuthentifierUsager
            nomUsager={this.state.nomUsager}
            redirectUrl={this.props.redirectUrl}
            idmg={this.props.idmg}
            u2fAuthRequest={this.state.u2fAuthRequest} />
      } else if (this.state.etatUsager === 'inconnu') {
        formulaire =
          <InscrireUsager
            nomUsager={this.state.nomUsager}
            redirectUrl={this.props.redirectUrl}
            idmg={this.props.idmg} />
      } else {
        formulaire = <AttendreVerificationUsager />
      }
    }

    return (
      <Container>
        <Row>
          <Col sm={2} md={3}></Col>
          <Col sm={8} md={6}>
            {formulaire}
          </Col>
          <Col sm={2} md={3}></Col>
        </Row>
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
    <Form>
      <Form.Group controlId="formNomUsager">
        <Form.Label>Nom d'usager</Form.Label>
        <Form.Control
          type="email"
          placeholder="Saisissez votre nom d'usager ici"
          value={props.nomUsager}
          onChange={props.changerNomUsager} />
        <Form.Text className="text-muted">
            Si vous voulez creer un nouveau compte, entrez votre nom d'usager desire et cliquez sur Suivant.
        </Form.Text>
      </Form.Group>

      <Button onClick={props.boutonUsagerSuivant}>Suivant</Button>
    </Form>
  )
}

class AuthentifierUsager extends React.Component {

  state = {
    motdepasse: '',
    motdepasseHash: '',
    u2fClientJson: '',
  }

  changerMotdepasse = event => {
    const {value} = event.currentTarget;

    this.setState({
      motdepasse: value,
    })
  }

  authentifier = event => {
    const {form} = event.currentTarget;
    const authRequest = this.props.u2fAuthRequest

    if(authRequest) {
      // Effectuer la verification avec cle U2F puis soumettre
      console.debug("Auth request")
      console.debug(authRequest)

      solveLoginChallenge(authRequest)
      .then(credentials=>{
        console.debug("Credentials")
        console.debug(credentials)

        const u2fClientJson = JSON.stringify(credentials)
        this.setState({u2fClientJson}, ()=>{
          form.submit()
        })
      })
      .catch(err=>{
        console.error("Erreur challenge reply registration security key");
        console.error(err);
      });

    } else {
      var motdepasseHash = createHash('sha256').update(this.state.motdepasse, 'utf-8').digest('base64')
      this.setState({
        motdepasseHash
      }, ()=>{
        form.submit()
      })
    }
  }

  componentDidMount() {
    // console.debug("Redirect url : " + this.props.redirectUrl)
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

    let formulaire;
    if(this.props.u2fAuthRequest) {
      formulaire = (
        <p>Inserer la cle U2F et cliquer sur suivant.</p>
      )
    } else {
      // Mot de passe
      formulaire = (
        <Form.Group controlId="formMotdepasse">
          <Form.Label>Mot de passe</Form.Label>
          <Form.Control
            type="password"
            name="motdepasse"
            value={this.state.motdepasse}
            autoComplete="current-password"
            onChange={this.changerMotdepasse}
            placeholder="Saisir votre mot de passe" />
        </Form.Group>
      )
    }

    return (
      <Form method="post" action="/authentification/ouvrir">

        <Form.Control type="text" name="nom-usager" autoComplete="username"
          defaultValue={this.props.nomUsager} className="champ-cache"/>
        <Form.Control type="hidden" name="motdepasse-hash"
          value={this.state.motdepasseHash} />

        <p>Usager : {this.props.nomUsager}</p>

        {formulaire}

        {hiddenParams}

        <Button onClick={this.authentifier}>Suivant</Button>

      </Form>
    )
  }

}

class InscrireUsager extends React.Component {

  state = {
    typeAuthentification: 'u2f',
  }

  changerTypeAuthentification = selectedType => {
    console.debug("Changer type authentification : %s", selectedType)
    this.setState({typeAuthentification: selectedType})
  }

  render() {

    // Set params hidden : nom usager, url redirection au besoin
    const optHiddenParams = []
    if(this.props.redirectUrl) {
      optHiddenParams.push(<Form.Control key="redirectUrl" type="hidden"
        name="url" value={this.props.redirectUrl} />)
    }

    let subform;
    if (this.state.typeAuthentification === 'motdepasse' ) {
      subform = <NouveauMotdepasse nomUsager={this.props.nomUsager} />
    } else if(this.state.typeAuthentification === 'u2f' ) {
      subform = <EnregistrerU2f nomUsager={this.props.nomUsager} />
    }

    return (
      <Form method="post" action="/authentification/inscrire">
        <Form.Control type="text" name="nom-usager" autoComplete="username"
          defaultValue={this.props.nomUsager} className="champ-cache" />
        <Form.Control type="hidden" name="type-authentification"
          value={this.state.typeAuthentification} />

        {optHiddenParams}

        <p>Creer un nouveau compte sur cette MilleGrille</p>
        <p>Usager : {this.props.nomUsager}</p>

        <Nav variant="tabs" defaultActiveKey="u2f" onSelect={this.changerTypeAuthentification}>
          <Nav.Item>
            <Nav.Link eventKey="u2f">USB</Nav.Link>
          </Nav.Item>
          <Nav.Item>
            <Nav.Link eventKey="motdepasse">Mot de passe</Nav.Link>
          </Nav.Item>
        </Nav>

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
    console.debug("Params : %s", params)

    axios.post('/authentification/challengeRegistrationU2f', params)
    .then(reponse=>{
      const {registrationRequest, replyId: u2fReplyId} = reponse.data
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
            name="u2f-reply-id" value={this.state.u2fReplyId} />

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

        <Button onClick={this.inscrireU2f}>Inscrire</Button>

      </div>
    )
  }

}

class NouveauMotdepasse extends React.Component {

  state = {
    motdepasse: '',
    motdepasse2: '',
    motdepasseMatch: false,
    motdepasseHash: '',
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

  inscrire = event => {
    const {form} = event.currentTarget

    const motdepasse = this.state.motdepasse
    var motdepasseHash = createHash('sha256').update(motdepasse, 'utf-8').digest('base64')

    this.setState({motdepasseHash}, ()=>{
      form.submit()
    })
  }

  render() {
    return (
      <div>
        <Form.Control key="motdepasseHash" type="hidden"
          name="motdepasse-hash" value={this.state.motdepasseHash} />

        <Form.Group controlId="formMotdepasse">
          <Form.Label>Nouveau mot de passe</Form.Label>
          <Form.Control
            type="password"
            name="motdepasse"
            value={this.state.motdepasse}
            autoComplete="new-password"
            onChange={this.changerMotdepasse}
            placeholder="Saisir votre nouveau mot de passe" />
        </Form.Group>

        <Form.Group controlId="formMotdepasse2">
          <Form.Control
            type="password"
            name="motdepasse2"
            value={this.state.motdepasse2}
            autoComplete="new-password"
            onChange={this.changerMotdepasse2}
            placeholder="Saisir votre nouveau mot de passe a nouveau" />
        </Form.Group>

        <Button onClick={this.inscrire}
          disabled={ ! this.state.motdepasseMatch }>Inscrire</Button>
      </div>
    )
  }
}

class ChangerMotdepasse extends React.Component {

  state = {
    motdepasseActuel: '',
    motdepasseActuelHash: '',
  }

  changerMotdepasseActuel = event => {
    var {value} = event.currentTarget
    var motdepasseActuelHash = createHash('sha256').update(value, 'utf-8').digest('base64')
    this.setState({motdepasseActuel: value, motdepasseActuelHash})
  }

  render() {
    return (
      <div>
        <Form.Group controlId="formMotdepasseActuel">
          <Form.Label>Mot de passe actuel</Form.Label>
          <Form.Control
            type="password"
            name="motdepasse-actuel"
            value={this.state.motdepasseActuel}
            autoComplete="current-password"
            onChange={this.changerMotdepasseActuel}
            placeholder="Saisir votre mot de passe actuel" />
        </Form.Group>

        <NouveauMotdepasse {...this.props}/>
      </div>
    )
  }
}
