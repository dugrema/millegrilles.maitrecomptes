import React from 'react'
import { Nav, Navbar, NavDropdown } from 'react-bootstrap';
import { Trans } from 'react-i18next';

export default function Menu(props) {
  var renderCleMillegrille = ''

  console.debug("Menu proppys : %O", props)

  const nomUsager = props.rootProps.nomUsager

  if(props.rootProps.cleMillegrillePresente) {
    renderCleMillegrille = (
      <Nav className="justify-content-end">
        <Nav.Link onClick={props.rootProps.setCleMillegrillePresente}>
          <span title="Cle de MilleGrille chargee">
            <i className="fa fa-key"/>
          </span>
        </Nav.Link>
      </Nav>
    )
  }

  let linkUsager = <><i className="fa fa-user-circle-o"/> {nomUsager}</>
  if(!nomUsager) linkUsager = 'Parametres'

  return (
    <Navbar collapseOnSelect expand="md" bg="info" variant="dark" fixed="top">

      <Nav.Link className="navbar-brand" onClick={props.goHome}>
        <Trans>application.nom</Trans>
      </Nav.Link>

      <Navbar.Collapse id="responsive-navbar-menu"></Navbar.Collapse>

      {renderCleMillegrille}
      <NavDropdown title={linkUsager} id="basic-nav-dropdown" drop="down" className="menu-item">
        <NavDropdown.Item onClick={props.rootProps.changerLanguage}>
          <Trans>menu.changerLangue</Trans>
        </NavDropdown.Item>
      </NavDropdown>

    </Navbar>
  )
}

function MenuItems(props) {
  return (
    <Nav className="mr-auto" activeKey={props.rootProps.page} onSelect={props.changerPage}>
    </Nav>
  )
}
