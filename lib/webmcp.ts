type Tool={name:string;description:string;inputSchema:object;annotations:{readOnlyHint:boolean;untrustedContentHint:boolean};execute:(input:unknown)=>unknown};
export type PlannerContext={registerTool:(tool:Tool,options:{signal:AbortSignal})=>unknown};
type Actions={plan:()=>Promise<unknown>;select:(id:string)=>void;read:()=>object};
function emptyInput(input:unknown){if(!input||typeof input!=="object"||Array.isArray(input)||Object.keys(input).length)throw new Error("This action accepts an empty object.")}
export function registerPlannerTools(context:PlannerContext|undefined,actions:{current:Actions}) {
  if(!context?.registerTool)return;
  const controller=new AbortController();
  const tools:Tool[]=[
    {name:"read_current_trip",description:"Read the current VeriPath trip inputs and selected route.",inputSchema:{type:"object",properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:false},execute(input){emptyInput(input);return actions.current.read()}},
    {name:"compare_current_routes",description:"Fetch NYC routes and historical collision evidence for the visible trip, then update the map and route cards. Sends trip coordinates to the routing provider.",inputSchema:{type:"object",properties:{},additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:true},async execute(input){emptyInput(input);return await actions.current.plan()}},
    {name:"select_existing_route",description:"Select an already loaded route and update the visible map; does not request a new trip.",inputSchema:{type:"object",properties:{routeId:{type:"string"}},required:["routeId"],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute(input){if(!input||typeof input!=="object"||Array.isArray(input)||Object.keys(input).length!==1||typeof (input as {routeId?:unknown}).routeId!=="string")throw new Error("Provide a routeId.");actions.current.select((input as {routeId:string}).routeId);return actions.current.read()}},
  ];
  for(const tool of tools){try{void Promise.resolve(context.registerTool(tool,{signal:controller.signal})).catch(()=>{})}catch{/* Optional browser capability; normal controls remain available. */}}
  return ()=>controller.abort();
}
