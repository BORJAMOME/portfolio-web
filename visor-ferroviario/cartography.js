(function(root){
  'use strict';
  const styles={
    '1668':{name:'Ibérico · 1.668 mm',color:'#0072B2'},
    '1435':{name:'Estándar · 1.435 mm',color:'#C45C00'},
    '1000':{name:'Métrico · 1.000 mm',color:'#00856A'},
    mixed:{name:'Ancho mixto',color:'#AA4499'},
    narrow:{name:'Estrecho · medida no publicada',color:'#716190'},
    other:{name:'Otros anchos documentados',color:'#76542C'},
    notApplicable:{name:'No aplica',color:'#A0A7B2'},
    pending:{name:'Pendiente de verificación',color:'#8B6B16'},
    unknown:{name:'Sin información',color:'#727C8B'}
  };
  function style(value){return styles[value]||styles.other;}
  function metrics(features){
    const unique=new Map(features.map(f=>[f.properties.id,f]));
    let length=0,known=0;const gauges=new Set();
    for(const f of unique.values()){
      // Solo ejes con atributos IGN: los tramos sin atributos son en su mayoría duplicados esquemáticos en nudos.
      if(f.properties.attr!==0)length+=Number(f.properties.length_m)||0;
      const g=root.AtlasFilters.value(f,'gauge');
      if(!['unknown','narrow','notApplicable','pending'].includes(g)){known++;gauges.add(g);}
    }
    return {sections:unique.size,km:length/1000,gauges:gauges.size,gaugeCoverage:unique.size?100*known/unique.size:null};
  }
  root.AtlasCartography={styles,style,metrics};
})(typeof window==='undefined'?globalThis:window);
