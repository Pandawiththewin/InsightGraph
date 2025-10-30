import React from "react";

export default class ErrorBoundary extends React.Component {
  constructor(p){ super(p); this.state = { error: null }; }
  static getDerivedStateFromError(error){ return { error }; }
  componentDidCatch(error, info){ console.error("UI Error:", error, info); }
  render(){
    if(this.state.error){
      return <div style={{padding:16,color:"crimson"}}>
        <h3>UI crashed</h3>
        <pre style={{whiteSpace:"pre-wrap"}}>{String(this.state.error?.message || this.state.error)}</pre>
      </div>;
    }
    return this.props.children;
  }
}
