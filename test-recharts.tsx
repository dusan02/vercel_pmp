import React from 'react';
import { renderToString } from 'react-dom/server';
import { ComposedChart, XAxis, YAxis, Bar, useYAxisScale } from 'recharts';

function CandleShape(props: any) {
  try {
    const yScale = useYAxisScale();
    console.log("yScale in shape:", !!yScale);
  } catch (e: any) {
    console.log("Error:", e.message);
  }
  return <rect x={props.x} y={props.y} width={props.width} height={props.height} />;
}

const data = [{ x: 1, c: 10 }];
const html = renderToString(
  <ComposedChart width={100} height={100} data={data}>
    <XAxis dataKey="x" />
    <YAxis />
    <Bar dataKey="c" shape={<CandleShape />} isAnimationActive={false} />
  </ComposedChart>
);
