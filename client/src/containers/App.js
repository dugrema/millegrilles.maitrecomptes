import React from 'react'
import './App.css'
import path from 'path'
import {Jumbotron, Container, Row, Col} from 'react-bootstrap'
import axios from 'axios'

import { LayoutMillegrilles } from './Layout'
import {Applications} from './Applications'
import {Authentifier} from './Authentification'

const MG_URL_API = '/millegrilles/api'
const MG_URL_AUTHENTIFICATION = '/millegrilles/authentification'

class App extends React.Component {

  state = {
    nomUsager: '',
    estProprietaire: false,
    idmg: '',
    proprietairePresent: true,
    titreMillegrille: '',

    page: 'Accueil',
    menuApplications: null,

    manifest: {
      version: 'DUMMY',
      date: 'DUMMY'
    }
  }

  setUsagerAuthentifie = (valeurs) => {
    this.setState(valeurs)
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
        idmg: infoMillegrille.idmg,
        titreMillegrille,
        proprietairePresent: infoMillegrille.proprietairePresent,
      })
    })
    .catch(err=>{
      console.error("Erreur acces site")
    })

  }

  render() {

    // console.debug("Nom usager : %s, estProprietaire : %s", this.state.nomUsager, this.state.estProprietaire)

    let affichage;
    if( ! this.state.idmg ) {
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
                    rootProps={this.state} />
    }

    return <LayoutApplication changerPage={this.changerPage} affichage={affichage} rootProps={{...this.state}} />
  }
}

// Layout general de l'application
function LayoutApplication(props) {

  const pageAffichee = (
    <div>
      <Jumbotron>
        <h1>{props.rootProps.titreMillegrille}</h1>
        <p className='idmg'>{props.rootProps.idmg}</p>
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

export default App;
