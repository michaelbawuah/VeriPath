// Conservative intersection context; callers retain ambiguous road assignment.
// Included inside namespace veripath after Road and geometric helpers.
struct Node {std::string id;Point point{};std::vector<size_t> roads;bool eligible=false;};
struct Intersection {std::string id;Point point{};double distance=INFINITY,gap=0;std::vector<size_t> roads;};
class Junctions {
 public:
  std::vector<Node> nodes;std::unordered_map<std::string,std::vector<size_t>> buckets;
  explicit Junctions(const std::vector<Road>&roads){
    std::map<std::string,std::vector<std::pair<size_t,Point>>> endpoints;
    for(size_t i=0;i<roads.size();i++){const auto&r=roads[i];if(r.line.empty())continue;if(!r.from.empty()&&r.from!="0000000")endpoints[r.from].push_back({i,r.line.front()});if(!r.to.empty()&&r.to!="0000000")endpoints[r.to].push_back({i,r.line.back()});}
    for(const auto&[id,entries]:endpoints){Node node{id,{}, {},false};bool valid=true;for(auto[i,p]:entries){node.point.x+=p.x;node.point.y+=p.y;node.roads.push_back(i);if(roads[i].levels!="MM")valid=false;}node.point.x/=entries.size();node.point.y/=entries.size();for(auto[i,p]:entries){(void)i;if(std::hypot(p.x-node.point.x,p.y-node.point.y)>3)valid=false;}
      bool distinct=false;for(auto a:node.roads)for(auto b:node.roads){auto names_a=split(roads[a].name,'|'),names_b=split(roads[b].name,'|');bool overlaps=false;for(const auto&name:names_a)if(!name.empty()&&std::find(names_b.begin(),names_b.end(),name)!=names_b.end())overlaps=true;if(!overlaps&&!roads[a].name.empty()&&!roads[b].name.empty()&&roads[a].physical!=roads[b].physical)distinct=true;}
      node.eligible=valid&&distinct;if(!node.eligible)continue;auto i=nodes.size();buckets[key(std::floor(node.point.x/cell),std::floor(node.point.y/cell))].push_back(i);nodes.push_back(std::move(node));
    }
  }
  std::vector<Intersection> nearby(Point p,const std::vector<Road>&roads,const std::string&on,const std::string&cross,bool require_names)const{
    std::vector<Intersection> out;auto first=normalize(on),second=normalize(cross);int gx=std::floor(p.x/cell),gy=std::floor(p.y/cell);
    for(int x=gx-1;x<=gx+1;x++)for(int y=gy-1;y<=gy+1;y++){auto bucket=buckets.find(key(x,y));if(bucket==buckets.end())continue;for(auto i:bucket->second){const auto&node=nodes[i];double d=std::hypot(p.x-node.point.x,p.y-node.point.y);if(d>35)continue;bool supported=!require_names;
      if(require_names&&!first.empty()&&!second.empty()&&first!=second)for(auto a:node.roads)for(auto b:node.roads){auto names_a=split(roads[a].name,'|'),names_b=split(roads[b].name,'|');bool overlaps=false;for(const auto&name:names_a)if(!name.empty()&&std::find(names_b.begin(),names_b.end(),name)!=names_b.end())overlaps=true;if(a!=b&&!overlaps&&roads[a].physical!=roads[b].physical&&std::find(names_a.begin(),names_a.end(),first)!=names_a.end()&&std::find(names_b.begin(),names_b.end(),second)!=names_b.end())supported=true;}
      if(supported)out.push_back({node.id,node.point,d,0,node.roads});}}
    std::sort(out.begin(),out.end(),[](const auto&a,const auto&b){return a.distance==b.distance?a.id<b.id:a.distance<b.distance;});if(!out.empty())out[0].gap=out.size()>1?out[1].distance-out[0].distance:999.;return out;
  }
};
