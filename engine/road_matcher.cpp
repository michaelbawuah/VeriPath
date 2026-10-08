// VeriPath's offline road assignment engine. Build with C++23.
#include <algorithm>
#include <cmath>
#include <cctype>
#include <fstream>
#include <iostream>
#include <limits>
#include <map>
#include <sstream>
#include <string>
#include <unordered_map>
#include <unordered_set>
#include <vector>

namespace veripath {
constexpr double sx=111320.0*0.7575649843840493, sy=110540.0, cell=100.0;
struct Point {double x,y;};
struct Road {std::string id,physical,name,levels;std::vector<Point> line;};
struct Match {std::string id,status="unmatched";double distance=INFINITY,gap=0;bool named=false;};
std::vector<std::string> split(const std::string&s,char delimiter){std::vector<std::string> out;std::stringstream in(s);std::string p;while(std::getline(in,p,delimiter))out.push_back(p);return out;}
std::string normalize(std::string s){
  for(char&c:s)c=std::isalnum(static_cast<unsigned char>(c))?static_cast<char>(std::toupper(static_cast<unsigned char>(c))):' ';
  auto words=split(s,' ');const std::map<std::string,std::string> aliases={{"STREET","ST"},{"AVENUE","AVE"},{"BOULEVARD","BLVD"},{"ROAD","RD"},{"DRIVE","DR"},{"PLACE","PL"},{"COURT","CT"},{"PARKWAY","PKWY"},{"NORTH","N"},{"SOUTH","S"},{"EAST","E"},{"WEST","W"},{"TERRACE","TER"}};
  std::string out;for(auto w:words){if(w.empty())continue;for(auto suffix:{"ST","ND","RD","TH"})if(w.size()>2&&w.ends_with(suffix)&&std::all_of(w.begin(),w.end()-2,[](char c){return std::isdigit(static_cast<unsigned char>(c));})){w.resize(w.size()-2);break;}if(auto a=aliases.find(w);a!=aliases.end())w=a->second;if(!out.empty())out+=' ';out+=w;}return out;
}
Point project(double lon,double lat){return {lon*sx,lat*sy};}
double segment_distance(Point p,Point a,Point b){auto dx=b.x-a.x,dy=b.y-a.y,d=dx*dx+dy*dy;auto t=d?std::clamp(((p.x-a.x)*dx+(p.y-a.y)*dy)/d,0.,1.):0.;return std::hypot(p.x-a.x-t*dx,p.y-a.y-t*dy);}
double distance(Point p,const Road&r){double d=INFINITY;for(size_t i=1;i<r.line.size();i++)d=std::min(d,segment_distance(p,r.line[i-1],r.line[i]));return d;}
std::string key(int x,int y){return std::to_string(x)+","+std::to_string(y);}
class Index {
 public:
  std::vector<Road> roads;std::unordered_map<std::string,std::vector<size_t>> buckets;
  explicit Index(std::vector<Road> data):roads(std::move(data)){
    for(size_t i=0;i<roads.size();i++){std::unordered_set<std::string> seen;for(size_t j=1;j<roads[i].line.size();j++){auto a=roads[i].line[j-1],b=roads[i].line[j];for(int x=std::floor(std::min(a.x,b.x)/cell);x<=std::floor(std::max(a.x,b.x)/cell);x++)for(int y=std::floor(std::min(a.y,b.y)/cell);y<=std::floor(std::max(a.y,b.y)/cell);y++)seen.insert(key(x,y));}for(auto&k:seen)buckets[k].push_back(i);}
  }
  Match match(Point p,const std::string& street) const {
    struct Candidate {size_t index;double distance;bool named;};std::vector<Candidate> candidates;std::unordered_set<size_t> seen;auto name=normalize(street);
    const int gx=std::floor(p.x/cell),gy=std::floor(p.y/cell);
    for(int x=gx-1;x<=gx+1;x++)for(int y=gy-1;y<=gy+1;y++){auto b=buckets.find(key(x,y));if(b==buckets.end())continue;for(auto i:b->second)if(seen.insert(i).second){auto d=distance(p,roads[i]);auto names=split(roads[i].name,'|');if(d<=35)candidates.push_back({i,d,!name.empty()&&std::find(names.begin(),names.end(),name)!=names.end()});}}
    if(candidates.empty())return {};
    auto all_candidates=candidates;bool any_named=std::any_of(candidates.begin(),candidates.end(),[](auto c){return c.named;});if(any_named)std::erase_if(candidates,[](auto c){return !c.named;});
    std::sort(candidates.begin(),candidates.end(),[&](auto a,auto b){return a.distance==b.distance?roads[a.index].id<roads[b.index].id:a.distance<b.distance;});
    auto best=candidates.front();const auto&r=roads[best.index];double other=INFINITY;
    for(auto c:candidates)if(roads[c.index].id!=r.id){other=c.distance;break;}
    Match out{r.id,"ambiguous",best.distance,std::isfinite(other)?other-best.distance:999.,best.named};
    const bool ground=r.levels=="MM";
    const bool grade_conflict=std::any_of(all_candidates.begin(),all_candidates.end(),[&](auto c){return roads[c.index].id!=r.id&&roads[c.index].levels!="MM"&&c.distance<=best.distance+6;});
    if(ground&&!grade_conflict&&best.distance<=20&&out.gap>=6&&(best.named||out.gap>=12))out.status="strong";
    return out;
  }
};
}
#ifndef VERIPATH_MATCHER_TEST
int main(int argc,char**argv){
  using namespace veripath;if(argc!=3){std::cerr<<"Usage: road_matcher roads.tsv crashes.tsv\n";return 2;}std::ifstream roads_in(argv[1]),crashes_in(argv[2]);if(!roads_in||!crashes_in){std::cerr<<"Cannot open input files\n";return 2;}
  std::vector<Road> roads;std::string line;while(std::getline(roads_in,line)){auto p=split(line,'\t');if(p.size()<5)continue;std::string names;for(auto name:split(p[2],'|')){if(!names.empty())names+='|';names+=normalize(name);}Road road{p[0],p[1],names,p[3],{}};for(auto v:split(p[4],';')){auto c=split(v,',');if(c.size()==2)road.line.push_back(project(std::stod(c[0]),std::stod(c[1])));}if(road.line.size()>1)roads.push_back(std::move(road));}
  Index index(std::move(roads));std::cout<<"id\troad_id\tstatus\tdistance_m\tmargin_m\tstreet_agrees\n";
  while(std::getline(crashes_in,line)){auto p=split(line,'\t');if(p.size()<4)continue;auto m=index.match(project(std::stod(p[1]),std::stod(p[2])),p[3]);std::cout<<p[0]<<'\t'<<m.id<<'\t'<<m.status<<'\t'<<m.distance<<'\t'<<m.gap<<'\t'<<m.named<<'\n';}
}
#endif
