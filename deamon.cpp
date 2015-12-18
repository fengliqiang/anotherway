#include <sys/types.h>
#include <sys/stat.h>
#include <unistd.h>
#include <signal.h>
#include <fcntl.h>
#include <stdlib.h>
#include <string.h>
#include <stdio.h>
static
void deamon_start(const char *workdir, unsigned int mask)
{
    int i, j;
   /*
    * change working directory, this step is optional
    */
    chdir( "/tmp" );
    if ( 0 != fork() ) {
       /*
        * parent terminates
        */
        exit( EXIT_SUCCESS );
    }
   /*
    * first child continues
    *
    * become session leader
    */
    setsid();
    signal( SIGHUP, SIG_IGN );
    if ( 0 != fork() ) {
       /*
        * first child terminates
        */
        exit( EXIT_SUCCESS );
    }
   /*
    * second child continues
    *
    * change working directory, chdir( "/" )
    */
    chdir( workdir );
   /*
    * clear our file mode creation mask, umask( 0 )
    */
    umask( (mode_t) mask );
    j = open( "/dev/null", O_RDWR );
    dup2( j, 0 );
    dup2( j, 1 );
    dup2( j, 2 );
    j = getdtablesize();
    for ( i = 3; i < j; i++ ) close( i );

}
#include <stdlib.h>
int main(int argc, char *argv[])
{
	deamon_start("/", 0);
	if ( argc < 2 ) return 0;
	char command[1024];
	int size = 0;
	for ( int i = 1; i < argc; i++ ) {
		size += sprintf(command + size, "%s ", argv[i]);
	}
	while ( true ) {
		system(command);
	}
	return 0;
}
