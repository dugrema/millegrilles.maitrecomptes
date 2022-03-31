import React from 'react'
import Nav from 'react-bootstrap/Nav'
import Navbar from 'react-bootstrap/Navbar'
import NavDropdown from 'react-bootstrap/NavDropdown'
import { Trans } from 'react-i18next'

import { IconeConnexion } from '@dugrema/millegrilles.reactjs'

function Menu(props) {
    return (
        <Navbar collapseOnSelect expand="md">
          
            <Navbar.Brand>
                <Nav.Link title="Accueil MilleGrilles">
                    Millegrilles
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

    const nomUsager = props.usager?props.usager.nomUsager:''
  
    let linkUsager = <><i className="fa fa-user-circle-o"/> {nomUsager}</>
    if(!nomUsager) linkUsager = 'Parametres'

    return (
        <NavDropdown title={linkUsager} id="basic-nav-dropdown" drop="down" className="menu-item">
            <NavDropdown.Item>
                <i className="fa fa-language" /> {' '} <Trans>menu.changerLangue</Trans>
            </NavDropdown.Item>
            <NavDropdown.Item>
                <i className="fa fa-user" /> {' '} <Trans>menu.compte</Trans>
            </NavDropdown.Item>
            <NavDropdown.Item href="/fermer">
                <i className="fa fa-close" /> {' '} <Trans>menu.deconnecter</Trans>
            </NavDropdown.Item>
        </NavDropdown>
    )

}
