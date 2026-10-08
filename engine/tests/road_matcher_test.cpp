#define VERIPATH_MATCHER_TEST
#include "../road_matcher.cpp"
#include <cassert>
int main(){using namespace veripath;
  assert(normalize("West 42nd Street")=="W 42 ST");
  std::vector<Road> roads={{"a","pa","MAIN ST","MM",{{0,0},{200,0}}},{"b","pb","SIDE ST","MM",{{0,10},{200,10}}},{"bridge","pc","BRIDGE RD","AA",{{0,200},{200,200}}}};
  Index index(roads);
  auto a=index.match({50,3},"Main Street");assert(a.id=="a"&&a.status=="strong");
  auto ambiguous=index.match({50,5},"");assert(ambiguous.status=="ambiguous");
  auto bridge=index.match({50,200},"Bridge Road");assert(bridge.status=="ambiguous");
  assert(index.match({500,500},"").status=="unmatched");
  Index unknown({{"unknown","u","MAIN ST","",{{0,0},{200,0}}}});assert(unknown.match({50,0},"Main Street").status=="ambiguous");
  Index split_pieces({{"left","same","MAIN ST","MM",{{0,0},{100,0}}},{"right","same","MAIN ST","MM",{{100,0},{200,0}}}});assert(split_pieces.match({100,0},"Main Street").status=="ambiguous");
  roads[0].line={{0,0},{50,0},{100,0},{200,0}};Index subdivided(roads);assert(subdivided.match({50,3},"Main Street").distance==a.distance);
  std::vector<Road> junction_roads={{"west","main","MAIN ST","MM",{{-100,0},{0,0}},"w","n"},{"east","main","MAIN ST","MM",{{0,0},{100,0}},"n","e"},{"north","side","SIDE ST","MM",{{0,0},{0,100}},"n","s"}};
  Index junction_index(junction_roads);Junctions junctions(junction_roads);
  auto node=junction_index.locate({1,1},"Main St","Side St",junctions);assert(node.first.status=="intersection"&&node.second=="n");
  assert(junction_index.locate({1,1},"Main St","",junctions).first.status=="ambiguous");
  assert(junction_index.locate({1,1},"Main St","Main St",junctions).first.status=="ambiguous");
  auto continuation=junction_roads;continuation.pop_back();Junctions straight(continuation);assert(straight.nodes.empty());
  auto crossing=junction_roads;crossing[2].from="different";Junctions disconnected(crossing);assert(disconnected.nodes.empty());
  auto overlapping=junction_roads;overlapping[2].name="SIDE ST|MAIN ST";Junctions alias_conflict(overlapping);assert(alias_conflict.nodes.empty());
  for(const auto&level:{"AA","","QQ"}){auto elevated=junction_roads;elevated[2].levels=level;Junctions rejected(elevated);assert(rejected.nodes.empty());}
  auto competing=junction_roads;competing.push_back({"bridge2","bridge","BRIDGE RD","AA",{{-100,2},{100,2}}});Index stacked(competing);Junctions stacked_nodes(competing);assert(stacked.locate({1,1},"Main St","Side St",stacked_nodes).first.status=="ambiguous");
  auto adjacent=junction_roads;adjacent.push_back({"close-main","p3","MAIN ST","MM",{{8,0},{100,0}},"n2","e2"});adjacent.push_back({"close-side","p4","SIDE ST","MM",{{8,0},{8,100}},"n2","s2"});Index close_nodes(adjacent);Junctions alternatives(adjacent);assert(close_nodes.locate({1,1},"Main St","Side St",alternatives).first.status=="ambiguous");
  std::cout<<"Passed C++23: street normalization, named parallel roads, ambiguous roads, grade separation, unmatched points, sampling invariance.\n";
}
