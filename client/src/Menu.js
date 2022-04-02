import {useCallback} from 'react'
import Nav from 'react-bootstrap/Nav'
import Navbar from 'react-bootstrap/Navbar'
import NavDropdown from 'react-bootstrap/NavDropdown'
import { Trans } from 'react-i18next'

import { IconeConnexion } from '@dugrema/millegrilles.reactjs'

function Menu(props) {

    const {setSectionAfficher} = props

    const accueilCb = useCallback(()=>setSectionAfficher(''), [setSectionAfficher])

    return (
        <Navbar collapseOnSelect expand="md">
          
            <Navbar.Brand>
                <Nav.Link title="Accueil MilleGrilles" onClick={accueilCb}>
                    MilleGrilles
                </Nav.Link>
            </Navbar.Brand>
  
            <Navbar.Collapse id="responsive-navbar-menu">
  
                <DropDownUsager {...props} />
  
            </Navbar.Collapse>
  
            <Nav><Nav.Item><IconeConnexion connecte={props.etatConnexion} /></Nav.Item></Nav>
  
            <Navbar.Toggle aria-controls="basic-navbar-nav" />
  
        </Navbar>
    )
}

export default Menu

function DropDownUsager(props) {

    const { usagerDbLocal, setSectionAfficher } = props

    const nomUsager = usagerDbLocal?usagerDbLocal.nomUsager:''

    const gestionCompteCb = useCallback(()=>{setSectionAfficher('GestionCompte')}, [setSectionAfficher])
  
    let linkUsager = <><i className="fa fa-user-circle-o"/> {nomUsager}</>
    if(!nomUsager) linkUsager = 'Parametres'

    return (
        <NavDropdown title={linkUsager} id="basic-nav-dropdown" drop="down" className="menu-item">
            <NavDropdown.Item>
                <i className="fa fa-language" /> {' '} <Trans>menu.changerLangue</Trans>
            </NavDropdown.Item>
            <NavDropdown.Item onClick={gestionCompteCb}>
                <i className="fa fa-user" /> {' '} <Trans>menu.compte</Trans>
            </NavDropdown.Item>
            <NavDropdown.Item href="/millegrilles/authentification/fermer">
                <i className="fa fa-close" /> {' '} <Trans>menu.deconnecter</Trans>
            </NavDropdown.Item>
        </NavDropdown>
    )

}
