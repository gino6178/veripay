// An error boundary per panel: if one part of a page can't render (an unexpected or missing field from an outside
// agent, say), that panel says so and the rest of the page keeps working.
import { Component } from "react";

export default class Safe extends Component {
  constructor(p) { super(p); this.state = { err: null }; }
  static getDerivedStateFromError(err) { return { err }; }
  componentDidCatch(err) { console.warn(`[${this.props.name || "panel"}]`, err?.message || err); }
  render() {
    if (!this.state.err) return this.props.children;
    return (
      <div className="note warn small" role="alert">
        {this.props.name ? <b>{this.props.name}: </b> : null}this part couldn't be shown. The rest of the page still works.
        {" "}<button className="link" onClick={() => this.setState({ err: null })}>Try again</button>
      </div>
    );
  }
}
