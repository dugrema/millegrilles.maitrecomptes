import React from 'react'
import './App.css'
import path from 'path'
import {Jumbotron, Container, Row, Col} from 'react-bootstrap'
import axios from 'axios'
import openSocket from 'socket.io-client'

import { LayoutMillegrilles } from './Layout'
import {Applications} from './Applications'
import {Authentifier} from './Authentification'

import {chargerDeLocal, validerChaineCertificats} from './Pki'

const MG_URL_API = '/millegrilles/api'
const MG_URL_AUTHENTIFICATION = '/millegrilles/authentification'
const MG_SOCKETIO_URL = '/millegrilles/socket.io'

class App extends React.Component {

  state = {
    nomUsager: '',
    estProprietaire: false,
    idmgServeur: '',
    proprietairePresent: true,
    titreMillegrille: '',

    page: 'Accueil',
    menuApplications: null,

    connexionSocketIo: null,
    modeProtege: false,

    manifest: {
      version: 'DUMMY',
      date: 'DUMMY'
    },

  }

  setUsagerAuthentifie = (valeurs) => {
    return new Promise((resolve, reject)=>{
      if(valeurs.nomUsager) {
        localStorage.setItem('usager', valeurs.nomUsager)
      }
      this.setState(valeurs, ()=>{resolve()})
    })
  }

  changerPage = page => {
    console.debug("Changer page")
    this.setState({page})
  }

  setMenuApplications = menuApplications => {
    this.setState({menuApplications})
  }

  componentDidMount() {
    const urlInfo = path.join('/millegrilles', 'info.json')

    axios.get(urlInfo)
    .then(response=>{
      // console.debug(response)
      const infoMillegrille = response.data
      const titreMillegrille = infoMillegrille.titre || 'MilleGrille'

      _setTitre(titreMillegrille)

      this.setState({
        idmgServeur: infoMillegrille.idmg,
        titreMillegrille,
        proprietairePresent: infoMillegrille.proprietairePresent,
      })
    })
    .catch(err=>{
      console.error("Erreur acces site")
    })

  }

  connecterSocketIo = () => {
    if( ! this.state.connexionSocketIo ) {
      console.debug("Connecter socket.io sur %s", MG_SOCKETIO_URL)
      const socket = openSocket('/', {
        path: MG_SOCKETIO_URL,
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 500,
        reconnectionDelayMax: 30000,
        randomizationFactor: 0.5
      })

      socket.on('disconnect', () => {this.deconnexionSocketIo()})
      socket.on('challengeU2F', repondreChallengeU2F)
      socket.on('modeProtege', reponse => {this.setEtatProtege(reponse)})

      this.setState({connexionSocketIo: socket})
    }
  }

  toggleProtege = () => {
    if( this.state.modeProtege ) {
      // console.debug("Desactiver mode protege")
      // Desactiver mode protege
      this.state.connexionSocketIo.emit('downgradePrive', {})
    } else {
      // console.debug("Activer mode protege")
      // Activer mode protege
      this.state.connexionSocketIo.emit('upgradeProtegerViaAuthU2F', {})
    }
  }

  setEtatProtege = reponse => {
    this.setState({modeProtege: reponse.etat})
  }

  deconnexionSocketIo = () => {
    // console.debug("Deconnexion Socket.IO")
    this.setState({modeProtege: false})
  }

  render() {

    // console.debug("Nom usager : %s, estProprietaire : %s", this.state.nomUsager, this.state.estProprietaire)

    let affichage;
    if( ! this.state.idmgServeur ) {
      // Chargement initial, affichage page attente
      affichage = <AttenteChargement />
    } else if( ! this.state.nomUsager && ! this.state.estProprietaire ) {
      const searchParams = new URLSearchParams(this.props.location.search)
      const redirectUrl = searchParams.get('url')
      affichage = <Authentifier
                    redirectUrl={redirectUrl}
                    setUsagerAuthentifie={this.setUsagerAuthentifie}
                    authUrl={MG_URL_AUTHENTIFICATION}
                    rootProps={this.state} />
    } else {
      affichage = <Applications
                    apiUrl={MG_URL_API}
                    authUrl={MG_URL_AUTHENTIFICATION}
                    nomUsagerAuthentifie={this.state.nomUsagerAuthentifie}
                    setMenuApplications={this.setMenuApplications}
                    connecterSocketIo={this.connecterSocketIo}
                    rootProps={this.state} />
    }

    return (
      <LayoutApplication
        changerPage={this.changerPage}
        affichage={affichage}
        rootProps={{...this.state, toggleProtege: this.toggleProtege}} />
    )
  }
}

// Layout general de l'application
function LayoutApplication(props) {

  const pageAffichee = (
    <div>
      <Jumbotron>
        <h1>{props.rootProps.titreMillegrille}</h1>
        <p className='idmg'>{props.rootProps.idmgServeur}</p>
        <p>{props.rootProps.nomUsager}</p>
      </Jumbotron>

      {props.affichage}
    </div>
  )

  return (
    <LayoutMillegrilles changerPage={props.changerPage} page={pageAffichee} rootProps={props.rootProps}/>
  )
}

function AttenteChargement(props) {
  return (
    <Container>
      <Col>
        <Row>
          <p>Attente chargement</p>
        </Row>
      </Col>
    </Container>
  )
}

function _setTitre(titre) {
  document.title = titre
  // const vitrineDescription = (<Translation>{t=>t('application.nom')}</Translation>);
  // if(configuration) {
  //   document.title = traduire(configuration, 'nomMilleGrille', language, configuration) || vitrineDescription;
  // } else {
  //   document.title = vitrineDescription;
  // }
}

function repondreChallengeU2F(challenge, cb) {
  console.debug("Challenge U2F socket.io")
  console.debug(challenge)
  const reponse = {'OK': true}
  cb(reponse)
}

export default App;
