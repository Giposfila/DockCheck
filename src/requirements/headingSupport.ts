export const HEADING_IMPLEMENTATIONS=new Set([
 'stu.structure.title','stu.structure.body','stu.heading.sections',
 ...['upper','bold','center','indent','underline','number'].map(k=>`stu.structural-heading.${k}`),
 ...['after-number','capital','bold','no-final-period','no-underline'].map(k=>`stu.heading-style.${k}`)
]);
