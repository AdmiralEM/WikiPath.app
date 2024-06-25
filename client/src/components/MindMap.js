import React, { useRef, useEffect } from "react";
import * as d3 from "d3";

const MindMap = ({ data }) => {
  const ref = useRef();

  useEffect(() => {
    const svg = d3.select(ref.current).attr("width", 800).attr("height", 600);

    const g = svg.append("g").attr("transform", "translate(400, 300)");

    const tree = d3.tree().size([2 * Math.PI, 300]);

    const root = d3.hierarchy({ name: "Root", children: data });
    tree(root);

    const link = g
      .selectAll(".link")
      .data(root.links())
      .enter()
      .append("path")
      .attr("class", "link")
      .attr(
        "d",
        d3
          .linkRadial()
          .angle((d) => d.x)
          .radius((d) => d.y)
      );

    const node = g
      .selectAll(".node")
      .data(root.descendants())
      .enter()
      .append("g")
      .attr("class", "node")
      .attr(
        "transform",
        (d) => `
        rotate(${(d.x * 180) / Math.PI - 90}) 
        translate(${d.y},0)
      `
      );

    node.append("circle").attr("r", 5);

    node
      .append("text")
      .attr("dy", "0.31em")
      .attr("x", (d) => (d.x < Math.PI ? 6 : -6))
      .attr("text-anchor", (d) => (d.x < Math.PI ? "start" : "end"))
      .attr("transform", (d) => (d.x >= Math.PI ? "rotate(180)" : null))
      .text((d) => d.data.name);
  }, [data]);

  return <svg ref={ref}></svg>;
};

export default MindMap;
